"""Paper broker: the ONLY execution venue in this application.

Orders live in the local database and are filled by a simulation model.
Nothing here talks to a broker. There is no live-trading switch.

Duplicate prevention: the order id is a deterministic UUIDv5 derived from
(experiment, intent_key), and (experiment, intent_key) is UNIQUE in the
database. Re-running a job after a crash or restart returns the existing
order instead of creating a second one.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..accounting import portfolio
from ..fees import FeeSchedule
from ..marketdata.base import Bar, Quote, Universe
from ..models import Experiment, Fill, Order
from ..money import Paise
from ..ops.audit import audit
from .fillmodel import BarFillModel, OrderView, QuoteFillModel

_NS = uuid.UUID("6f1c2b8e-3d0a-4b7e-9a51-2c4d8e7f9a10")
OPEN_STATES = ("OPEN", "PARTIALLY_FILLED")


def order_id_for(exp_id: int, intent_key: str) -> str:
    return str(uuid.uuid5(_NS, f"{exp_id}|{intent_key}"))


class PaperBroker:
    def __init__(
        self,
        schedule: FeeSchedule,
        universe: Universe,
        latency: timedelta = timedelta(seconds=2),
        quote_model: QuoteFillModel | None = None,
        bar_model: BarFillModel | None = None,
    ) -> None:
        self.schedule = schedule
        self.universe = universe
        self.latency = latency
        self.quote_model = quote_model or QuoteFillModel()
        self.bar_model = bar_model or BarFillModel()

    # ----------------------------------------------------------- submit
    def submit(
        self, s: Session, exp: Experiment, now: datetime, session_date: date, symbol: str, side: str,
        qty: int, limit: Paise, intent: str, intent_key: str, reason: str,
        band: tuple[Paise | None, Paise | None] = (None, None), signal_id: int | None = None,
        actor: str = "engine",
    ) -> Order:
        existing = s.scalars(select(Order).where(Order.experiment_id == exp.id, Order.intent_key == intent_key)).first()
        if existing is not None:
            return existing  # idempotent: never a duplicate order
        reject = self._precheck(s, exp, side, qty, limit, intent, symbol, band)
        reserve = portfolio.buy_reservation(self.schedule, qty, limit) if side == "BUY" and qty > 0 else 0
        o = Order(
            id=order_id_for(exp.id, intent_key), experiment_id=exp.id, intent_key=intent_key,
            session_date=session_date, symbol=symbol, side=side, quantity=max(qty, 1), limit_price_paise=limit,
            intent=intent, reason=reason, signal_id=signal_id, created_at=now, eligible_at=now + self.latency,
            status="REJECTED" if reject else "OPEN", reject_reason=reject,
            reserved_paise=0 if reject else reserve, closed_at=now if reject else None,
        )
        s.add(o)
        s.flush()
        audit(s, now, actor, "order.rejected" if reject else "order.submitted", {
            "order_id": o.id, "symbol": symbol, "side": side, "qty": qty, "limit_paise": limit,
            "intent": intent, "reason": reason, "reject_reason": reject}, exp.id)
        return o

    def _precheck(
        self, s: Session, exp: Experiment, side: str, qty: int, limit: Paise, intent: str, symbol: str,
        band: tuple[Paise | None, Paise | None],
    ) -> str | None:
        if exp.status != "RUNNING":
            return f"experiment status {exp.status}"
        if side not in ("BUY", "SELL"):
            return "invalid side"
        if intent not in ("ENTRY", "EXIT", "LIQUIDATE"):
            return "invalid intent"
        if side == "BUY" and intent != "ENTRY":
            return "only ENTRY orders may buy"
        if qty <= 0:
            return "quantity must be a positive whole number of units"
        if limit <= 0:
            return "limit price must be positive"
        try:
            tick = self.universe.get(symbol).tick_paise
        except KeyError:
            return "instrument not in frozen universe"
        if limit % tick:
            return f"limit not a multiple of tick {tick}"
        lo, hi = band
        if (lo is not None and limit < lo) or (hi is not None and limit > hi):
            return f"limit outside exchange price band [{lo}, {hi}]"
        if side == "BUY":
            if exp.entries_paused:
                return f"new entries paused: {exp.entries_paused_reason}"
            if exp.liquidation_requested:
                return "liquidation in progress"
            need = portfolio.buy_reservation(self.schedule, qty, limit)
            if need > portfolio.available_cash(s, exp.id):
                return "insufficient available cash (no margin or borrowing)"
            risk = json.loads(exp.risk_json)
            invested = sum(p.cost_paise for p in portfolio.positions(s, exp.id).values())
            if invested + portfolio.reserved(s, exp.id) + need > int(risk["max_invested_paise"]):
                return "would exceed maximum aggregate invested amount"
        else:
            held = portfolio.positions(s, exp.id).get(symbol)
            free = (held.qty if held else 0) - portfolio.pending_sell_qty(s, exp.id, symbol)
            if qty > free:
                return f"sell {qty} exceeds free holding {free} (no short selling)"
        return None

    # ----------------------------------------------------------- fills
    def open_orders(self, s: Session, exp: Experiment) -> list[Order]:
        return list(s.scalars(select(Order).where(Order.experiment_id == exp.id, Order.status.in_(OPEN_STATES))
                              .order_by(Order.created_at)))

    def process_quotes(
        self, s: Session, exp: Experiment, now: datetime, quotes: dict[str, Quote], stale: set[str]
    ) -> list[Fill]:
        fills: list[Fill] = []
        for o in self.open_orders(s, exp):
            q = quotes.get(o.symbol)
            if q is None:
                continue
            view = OrderView(o.side, o.quantity - o.filled_qty, o.limit_price_paise, o.eligible_at)
            dec, _why = self.quote_model.decide(view, q, now, o.symbol in stale, self.universe.get(o.symbol).tick_paise)
            if dec is not None:
                fills.append(self._fill(s, exp, o, dec.qty, dec.price, now, dec.ref))
        return fills

    def process_bars(self, s: Session, exp: Experiment, now: datetime, bars: dict[str, Bar]) -> list[Fill]:
        fills: list[Fill] = []
        for o in self.open_orders(s, exp):
            b = bars.get(o.symbol)
            if b is None:
                continue
            view = OrderView(o.side, o.quantity - o.filled_qty, o.limit_price_paise, o.eligible_at)
            dec, _why = self.bar_model.decide(view, b, self.universe.get(o.symbol).tick_paise)
            if dec is not None:
                fills.append(self._fill(s, exp, o, dec.qty, dec.price, now, f"bar {b.day} {dec.ref}"))
        return fills

    def _fill(self, s: Session, exp: Experiment, o: Order, qty: int, price: Paise, now: datetime, ref: str) -> Fill:
        f = portfolio.apply_fill(s, exp, o, qty, price, now, ref, self.schedule)
        audit(s, now, "paper-broker", "order.fill", {
            "order_id": o.id, "seq": f.seq, "qty": qty, "price_paise": price,
            "charges_paise": f.charges_paise, "market_ref": ref}, exp.id)
        return f

    # --------------------------------------------------------- cancels
    def cancel_open(
        self, s: Session, exp: Experiment, now: datetime, reason: str, side: str | None = None,
        status: str = "CANCELLED", actor: str = "engine",
    ) -> int:
        n = 0
        for o in self.open_orders(s, exp):
            if side and o.side != side:
                continue
            o.status = status
            o.cancel_reason = reason
            o.closed_at = now
            o.reserved_paise = 0
            n += 1
        if n:
            audit(s, now, actor, "orders.cancelled", {"count": n, "reason": reason, "side": side, "status": status}, exp.id)
        return n

    def expire_day_orders(self, s: Session, exp: Experiment, now: datetime, session_date: date) -> int:
        """DAY orders: any unfilled remainder expires at the session close."""
        n = 0
        for o in self.open_orders(s, exp):
            if o.session_date <= session_date:
                o.status = "EXPIRED" if o.filled_qty == 0 else "PART_EXPIRED"
                o.cancel_reason = "day order expired at close"
                o.closed_at = now
                o.reserved_paise = 0
                n += 1
        if n:
            audit(s, now, "engine", "orders.expired", {"count": n, "session_date": session_date.isoformat()}, exp.id)
        return n
