"""Equity snapshots, returns and summary statistics.

Daily net return for session t (each layer computed the same way):
    r_t = (E_t - E_{t-1} - F_t) / E_{t-1}
where E is closing equity and F_t is external cash flow in session t
(deposits are not performance). E_0 is starting capital.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Experiment, ExperimentSession, Fill
from ..money import Paise
from . import portfolio
from .expenses import opex_accrued, setup_allocated

TARGET_DAILY = 0.10  # research hypothesis only, NOT an expectation


@dataclass(frozen=True)
class EquitySnapshot:
    cash: Paise
    reserved: Paise
    market_value: Paise
    trading: Paise
    opex_cum: Paise
    setup_cum: Paise
    economic: Paise
    allin: Paise
    unpriced: tuple[str, ...]  # symbols with no usable mark


def snapshot(s: Session, exp: Experiment, as_of: date, marks: dict[str, Paise]) -> EquitySnapshot:
    c = portfolio.cash(s, exp.id)
    r = portfolio.reserved(s, exp.id)
    mv = 0
    unpriced = []
    for sym, p in portfolio.positions(s, exp.id).items():
        if sym in marks:
            mv += p.qty * marks[sym]
        else:
            unpriced.append(sym)
            mv += p.cost_paise  # fallback: carry at cost, flagged as unpriced
    trading = c + mv
    opex = opex_accrued(s, exp, as_of)
    setup = setup_allocated(s, exp, as_of)
    return EquitySnapshot(c, r, mv, trading, opex, setup, trading - opex, trading - opex - setup, tuple(unpriced))


def net_return(prev: Paise, cur: Paise, flow: Paise) -> float | None:
    if prev <= 0:
        return None
    return (cur - prev - flow) / prev


def max_drawdown(values: list[Paise]) -> float:
    peak = 0
    mdd = 0.0
    for v in values:
        peak = max(peak, v)
        if peak > 0:
            mdd = max(mdd, (peak - v) / peak)
    return mdd


def target_curve(start: Paise, n: int) -> list[float]:
    """Hypothetical 10%/session compounding. Shown for comparison only."""
    return [start * (1 + TARGET_DAILY) ** i / 100 for i in range(n + 1)]


@dataclass(frozen=True)
class Summary:
    sessions_closed: int
    trading_return: float | None
    economic_return: float | None
    allin_return: float | None
    benchmark_return: float | None
    max_dd_economic: float
    sessions_hit_target: int
    pct_sessions_hit_target: float | None
    total_charges: Paise
    total_turnover: Paise
    turnover_ratio: float | None
    realised_gross: Paise


def summarise(s: Session, exp: Experiment) -> Summary:
    rows = list(s.scalars(select(ExperimentSession).where(
        ExperimentSession.experiment_id == exp.id, ExperimentSession.status == "CLOSED",
        ExperimentSession.session_number.is_not(None)).order_by(ExperimentSession.session_date)))
    start = exp.starting_capital_paise
    charges = int(s.scalar(select(func.coalesce(func.sum(Fill.charges_paise), 0)).where(Fill.experiment_id == exp.id)) or 0)
    from ..models import LedgerEntry

    dp = -int(s.scalar(select(func.coalesce(func.sum(LedgerEntry.amount_paise), 0)).where(
        LedgerEntry.experiment_id == exp.id, LedgerEntry.kind == "DP_CHARGE")) or 0)
    turnover = int(s.scalar(select(func.coalesce(func.sum(Fill.turnover_paise), 0)).where(Fill.experiment_id == exp.id)) or 0)
    realised = int(s.scalar(select(func.coalesce(func.sum(Fill.realised_gross_paise), 0)).where(Fill.experiment_id == exp.id)) or 0)
    if not rows:
        return Summary(0, None, None, None, None, 0.0, 0, None, charges + dp, turnover, None, realised)
    last = rows[-1]
    flows = sum(r.external_flow_paise for r in rows)
    econ = [start] + [r.economic_equity_paise for r in rows]
    hits = sum(1 for r in rows if r.return_economic is not None and r.return_economic >= TARGET_DAILY)
    avg_eq = sum(r.trading_equity_paise for r in rows) / len(rows)
    bench0 = start
    return Summary(
        sessions_closed=len(rows),
        trading_return=(last.trading_equity_paise - start - flows) / start,
        economic_return=(last.economic_equity_paise - start - flows) / start,
        allin_return=(last.allin_equity_paise - start - flows) / start,
        benchmark_return=(last.benchmark_value_paise - bench0) / bench0 if last.benchmark_value_paise else None,
        max_dd_economic=max_drawdown(econ),
        sessions_hit_target=hits,
        pct_sessions_hit_target=hits / len(rows),
        total_charges=charges + dp,
        total_turnover=turnover,
        turnover_ratio=turnover / avg_eq if avg_eq else None,
        realised_gross=realised,
    )


def indicative_tax(realised_net_gain: Paise) -> Paise:
    """VERY rough short-term capital gains estimate (20% on listed equity held < 12 months,
    post-23 July 2024 rules). Gold ETFs are taxed differently (slab rate). Paper gains
    are not taxable; this is shown only to illustrate what real trading might incur.
    Not tax advice."""
    return max(0, realised_net_gain) * 20 // 100
