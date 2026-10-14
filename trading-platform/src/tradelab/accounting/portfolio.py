"""Virtual trading account: cash ledger, FIFO lots, fills, corporate actions, reconciliation.

Rules:
- Cash only changes through append-only ledger rows with a unique ref, so a
  fill, DP charge or dividend can never be booked twice.
- No short selling: a sell can never exceed held units.
- No margin/borrowing: buys are rejected if they exceed available cash.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..fees import FeeSchedule, fill_charges
from ..models import (
    CorporateAction,
    CorporateActionApplied,
    Experiment,
    ExternalFlow,
    Fill,
    LedgerEntry,
    Lot,
    Order,
)
from ..money import Paise


class AccountingError(RuntimeError):
    pass


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: int
    cost_paise: Paise  # purchase cost of held units, excluding charges

    @property
    def avg_cost(self) -> float:
        return self.cost_paise / self.qty if self.qty else 0.0


def post(
    s: Session, exp_id: int, ts: datetime, session_date: date, kind: str, amount: Paise,
    ref: str, symbol: str | None = None, memo: str | None = None,
) -> LedgerEntry:
    existing = s.scalars(
        select(LedgerEntry).where(LedgerEntry.experiment_id == exp_id, LedgerEntry.kind == kind, LedgerEntry.ref == ref)
    ).first()
    if existing is not None:
        raise AccountingError(f"duplicate ledger posting {kind} {ref}")
    e = LedgerEntry(experiment_id=exp_id, ts=ts, session_date=session_date, kind=kind,
                    amount_paise=amount, symbol=symbol, ref=ref, memo=memo)
    s.add(e)
    s.flush()
    return e


def cash(s: Session, exp_id: int) -> Paise:
    v = s.scalar(select(func.coalesce(func.sum(LedgerEntry.amount_paise), 0)).where(LedgerEntry.experiment_id == exp_id))
    return int(v or 0)


def reserved(s: Session, exp_id: int) -> Paise:
    v = s.scalar(
        select(func.coalesce(func.sum(Order.reserved_paise), 0)).where(
            Order.experiment_id == exp_id, Order.status.in_(("OPEN", "PARTIALLY_FILLED")), Order.side == "BUY"
        )
    )
    return int(v or 0)


def available_cash(s: Session, exp_id: int) -> Paise:
    return cash(s, exp_id) - reserved(s, exp_id)


def positions(s: Session, exp_id: int) -> dict[str, Position]:
    rows = s.execute(
        select(Lot.symbol, func.sum(Lot.qty_remaining), func.sum(Lot.cost_remaining_paise))
        .where(Lot.experiment_id == exp_id, Lot.qty_remaining > 0)
        .group_by(Lot.symbol)
    ).all()
    return {sym: Position(sym, int(q), int(c)) for sym, q, c in rows if q}


def pending_sell_qty(s: Session, exp_id: int, symbol: str, exclude_order: str | None = None) -> int:
    q = select(func.coalesce(func.sum(Order.quantity - Order.filled_qty), 0)).where(
        Order.experiment_id == exp_id, Order.symbol == symbol, Order.side == "SELL",
        Order.status.in_(("OPEN", "PARTIALLY_FILLED")),
    )
    if exclude_order:
        q = q.where(Order.id != exclude_order)
    return int(s.scalar(q) or 0)


def buy_reservation(schedule: FeeSchedule, qty: int, limit: Paise) -> Paise:
    t = qty * limit
    return t + fill_charges(schedule, "BUY", t).total


def apply_fill(
    s: Session, exp: Experiment, order: Order, qty: int, price: Paise, ts: datetime,
    market_ref: str, schedule: FeeSchedule,
) -> Fill:
    if qty <= 0 or qty > order.quantity - order.filled_qty:
        raise AccountingError(f"invalid fill qty {qty} for order {order.id}")
    if order.side == "BUY" and price > order.limit_price_paise:
        raise AccountingError("buy fill above limit")
    if order.side == "SELL" and price < order.limit_price_paise:
        raise AccountingError("sell fill below limit")
    seq = int(s.scalar(select(func.count()).select_from(Fill).where(Fill.order_id == order.id)) or 0) + 1
    turnover = qty * price
    ch = fill_charges(schedule, order.side, turnover)
    realised = 0
    if order.side == "SELL":
        held = positions(s, exp.id).get(order.symbol)
        if held is None or held.qty < qty:
            raise AccountingError(f"short sale prevented: selling {qty} {order.symbol}, holding {held.qty if held else 0}")
    f = Fill(order_id=order.id, seq=seq, experiment_id=exp.id, session_date=order.session_date,
             symbol=order.symbol, side=order.side, ts=ts, qty=qty, price_paise=price, turnover_paise=turnover,
             charges_paise=ch.total, charges_json=json.dumps(ch.as_dict()), market_ref=market_ref)
    s.add(f)
    s.flush()
    ref = f"fill:{f.id}"
    if order.side == "BUY":
        post(s, exp.id, ts, order.session_date, "BUY", -turnover, ref, order.symbol, f"{qty} @ {price / 100:.2f}")
        s.add(Lot(experiment_id=exp.id, symbol=order.symbol, fill_id=f.id, opened_at=ts,
                  qty_remaining=qty, cost_remaining_paise=turnover))
    else:
        remaining = qty
        cost_out = 0
        for lot in s.scalars(select(Lot).where(Lot.experiment_id == exp.id, Lot.symbol == order.symbol,
                                               Lot.qty_remaining > 0).order_by(Lot.id)):
            take = min(remaining, lot.qty_remaining)
            c = lot.cost_remaining_paise if take == lot.qty_remaining else round(lot.cost_remaining_paise * take / lot.qty_remaining)
            lot.qty_remaining -= take
            lot.cost_remaining_paise -= c
            cost_out += c
            remaining -= take
            if remaining == 0:
                break
        realised = turnover - cost_out
        f.realised_gross_paise = realised
        post(s, exp.id, ts, order.session_date, "SELL", turnover, ref, order.symbol, f"{qty} @ {price / 100:.2f}")
        dp_ref = f"dp:{order.symbol}:{order.session_date.isoformat()}"
        if s.scalars(select(LedgerEntry).where(LedgerEntry.experiment_id == exp.id, LedgerEntry.ref == dp_ref)).first() is None:
            post(s, exp.id, ts, order.session_date, "DP_CHARGE", -schedule.dp_charge_per_scrip_sell_day_paise,
                 dp_ref, order.symbol, "Depository charge, once per scrip per sell day")
    post(s, exp.id, ts, order.session_date, "CHARGES", -ch.total, ref, order.symbol, "STT/exchange/SEBI/stamp/GST")

    new_filled = order.filled_qty + qty
    order.avg_fill_price_paise = round((order.avg_fill_price_paise * order.filled_qty + turnover) / new_filled)
    order.filled_qty = new_filled
    if new_filled == order.quantity:
        order.status = "FILLED"
        order.closed_at = ts
        order.reserved_paise = 0
    else:
        order.status = "PARTIALLY_FILLED"
        if order.side == "BUY":
            order.reserved_paise = buy_reservation(schedule, order.quantity - new_filled, order.limit_price_paise)
    s.flush()
    if cash(s, exp.id) < 0:
        raise AccountingError("cash would go negative (no margin/borrowing allowed)")
    return f


# --------------------------------------------------------- corporate actions


def apply_corporate_actions(s: Session, exp: Experiment, session_date: date, ts: datetime) -> list[str]:
    """Apply actions with ex_date == session_date (call before the session trades). Idempotent."""
    notes: list[str] = []
    acts = s.scalars(select(CorporateAction).where(CorporateAction.ex_date <= session_date)).all()
    for ca in acts:
        already = s.scalars(select(CorporateActionApplied).where(
            CorporateActionApplied.experiment_id == exp.id, CorporateActionApplied.action_id == ca.id)).first()
        if already:
            continue
        if exp.start_session_date is None or ca.ex_date < exp.start_session_date:
            continue  # before this experiment: irrelevant to its positions
        detail: dict[str, object] = {"symbol": ca.symbol, "kind": ca.kind}
        lots = s.scalars(select(Lot).where(Lot.experiment_id == exp.id, Lot.symbol == ca.symbol,
                                           Lot.qty_remaining > 0)).all()
        held = sum(l.qty_remaining for l in lots)
        if ca.kind in ("SPLIT", "BONUS"):
            added = 0
            for l in lots:
                new_q = l.qty_remaining * ca.ratio_new // ca.ratio_old
                added += new_q - l.qty_remaining
                l.qty_remaining = new_q  # total cost unchanged
            detail["units_added"] = added
            if exp.benchmark_symbol == ca.symbol and exp.benchmark_qty:
                exp.benchmark_qty = exp.benchmark_qty * ca.ratio_new // ca.ratio_old
            # Exchanges cancel outstanding orders in a scrip on its ex-date.
            for o in s.scalars(select(Order).where(Order.experiment_id == exp.id, Order.symbol == ca.symbol,
                                                   Order.status.in_(("OPEN", "PARTIALLY_FILLED")))):
                o.status, o.cancel_reason, o.closed_at, o.reserved_paise = "CANCELLED", f"corporate action {ca.kind}", ts, 0
            notes.append(f"{ca.kind} {ca.symbol} {ca.ratio_new}:{ca.ratio_old}, +{added} units")
        elif ca.kind == "DIVIDEND":
            amt = held * ca.dividend_per_unit_paise
            detail["units_held"] = held
            detail["amount_paise"] = amt
            if amt:
                # Simplification: credited on ex-date (real payment arrives later).
                post(s, exp.id, ts, session_date, "DIVIDEND", amt, f"ca:{ca.id}", ca.symbol,
                     "Dividend entitlement credited on ex-date (simplification)")
            if exp.benchmark_symbol == ca.symbol and exp.benchmark_qty:
                exp.benchmark_cash_paise += exp.benchmark_qty * ca.dividend_per_unit_paise
            notes.append(f"DIVIDEND {ca.symbol} {held} units x {ca.dividend_per_unit_paise}p")
        s.add(CorporateActionApplied(experiment_id=exp.id, action_id=ca.id, applied_at=ts, detail=json.dumps(detail)))
    s.flush()
    return notes


# ------------------------------------------------------------ reconciliation


def reconcile(s: Session, exp: Experiment) -> list[str]:
    """Independent re-derivation of cash and holdings. Empty list == consistent."""
    problems: list[str] = []
    led: dict[str, int] = defaultdict(int)
    for kind, amt in s.execute(select(LedgerEntry.kind, LedgerEntry.amount_paise).where(LedgerEntry.experiment_id == exp.id)):
        led[kind] += amt
    fills = s.scalars(select(Fill).where(Fill.experiment_id == exp.id)).all()
    buy_t = sum(f.turnover_paise for f in fills if f.side == "BUY")
    sell_t = sum(f.turnover_paise for f in fills if f.side == "SELL")
    chg = sum(f.charges_paise for f in fills)
    if led["BUY"] != -buy_t:
        problems.append(f"ledger BUY {led['BUY']} != fills {-buy_t}")
    if led["SELL"] != sell_t:
        problems.append(f"ledger SELL {led['SELL']} != fills {sell_t}")
    if led["CHARGES"] != -chg:
        problems.append(f"ledger CHARGES {led['CHARGES']} != fills {-chg}")
    sell_days = {(f.symbol, f.session_date) for f in fills if f.side == "SELL"}
    n_dp = int(s.scalar(select(func.count()).select_from(LedgerEntry).where(
        LedgerEntry.experiment_id == exp.id, LedgerEntry.kind == "DP_CHARGE")) or 0)
    if n_dp != len(sell_days):
        problems.append(f"DP charges booked {n_dp} != scrip-sell-days {len(sell_days)}")
    flows = int(s.scalar(select(func.coalesce(func.sum(ExternalFlow.amount_paise), 0)).where(
        ExternalFlow.experiment_id == exp.id)) or 0)
    if led["EXTERNAL_FLOW"] != flows:
        problems.append(f"ledger EXTERNAL_FLOW {led['EXTERNAL_FLOW']} != flows table {flows}")
    if led["INITIAL_CAPITAL"] != exp.starting_capital_paise:
        problems.append("initial capital ledger mismatch")
    c = sum(led.values())
    if c < 0:
        problems.append(f"negative cash {c}")
    # holdings
    added: dict[str, int] = defaultdict(int)
    for a in s.scalars(select(CorporateActionApplied).where(CorporateActionApplied.experiment_id == exp.id)):
        d = json.loads(a.detail)
        added[str(d["symbol"])] += int(d.get("units_added", 0))
    expect: dict[str, int] = defaultdict(int)
    for f in fills:
        expect[f.symbol] += f.qty if f.side == "BUY" else -f.qty
    for sym, n in added.items():
        expect[sym] += n
    pos = positions(s, exp.id)
    for sym in set(expect) | set(pos):
        have = pos[sym].qty if sym in pos else 0
        if have != expect[sym]:
            problems.append(f"{sym}: lots hold {have}, fills imply {expect[sym]}")
        if expect[sym] < 0:
            problems.append(f"{sym}: negative position implied")
    # orders vs fills
    per_order: dict[str, int] = defaultdict(int)
    for f in fills:
        per_order[f.order_id] += f.qty
    for o in s.scalars(select(Order).where(Order.experiment_id == exp.id)):
        if o.filled_qty != per_order.get(o.id, 0):
            problems.append(f"order {o.id[:8]} filled_qty {o.filled_qty} != fills {per_order.get(o.id, 0)}")
        if o.status == "FILLED" and o.filled_qty != o.quantity:
            problems.append(f"order {o.id[:8]} FILLED but qty mismatch")
    if reserved(s, exp.id) > c:
        problems.append("reserved cash exceeds cash")
    return problems
