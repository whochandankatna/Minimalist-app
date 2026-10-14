"""Costs paid outside the virtual account, and how they are attributed.

Three non-overlapping layers (no double counting):
  1. Trading account: trading charges (STT, exchange, SEBI, stamp, GST, DP)
     are paid FROM virtual cash. They appear only here.
  2. Economic: trading equity minus OPERATING expenses (API, hosting, AI,
     data) accrued per calendar day over the experiment's life. Weekends and
     holidays accrue too; they land in the next session's return.
  3. All-in project: economic minus SETUP (one-off) costs allocated to the experiment.

Expense rows with experiment_id NULL belong to the project and are attributed
to OFFICIAL experiments only (only one may run at a time). Demo experiments
see only expenses attached to them explicitly.
"""

from __future__ import annotations

import calendar as _cal
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..clock import ist_date
from ..models import Expense, Experiment
from ..money import Paise


def _exp_start(exp: Experiment) -> date | None:
    if exp.start_session_date is None or exp.started_at is None:
        return None
    return min(ist_date(exp.started_at), exp.start_session_date)


def _exp_end(exp: Experiment) -> date | None:
    return ist_date(exp.ended_at) if exp.ended_at else None


def _rows(s: Session, exp: Experiment, scope: str) -> list[Expense]:
    cond = Expense.experiment_id == exp.id
    if exp.purpose == "OFFICIAL":
        cond = or_(cond, Expense.experiment_id.is_(None))
    return list(s.scalars(select(Expense).where(Expense.scope == scope, cond)))


def daily_accrual(e: Expense, d: date) -> Decimal:
    """Accrued amount (paise, unrounded) of a MONTHLY expense on calendar day d."""
    if e.basis != "MONTHLY" or d < e.start_date or (e.end_date and d > e.end_date):
        return Decimal(0)
    days = _cal.monthrange(d.year, d.month)[1]
    return Decimal(e.amount_paise) / days


def opex_accrued(s: Session, exp: Experiment, through: date) -> Paise:
    start = _exp_start(exp)
    if start is None or through < start:
        return 0
    end = min(through, _exp_end(exp) or through)
    total = Decimal(0)
    for e in _rows(s, exp, "OPERATING"):
        if e.basis == "ONE_OFF":
            if start <= e.start_date <= end:
                total += e.amount_paise
            continue
        d = max(start, e.start_date)
        while d <= end:
            total += daily_accrual(e, d)
            d += timedelta(days=1)
    return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def setup_allocated(s: Session, exp: Experiment, through: date) -> Paise:
    """Setup costs charged to this experiment's all-in view.

    Experiment-specific rows count once incurred. Project rows (experiment_id NULL)
    are charged to the earliest OFFICIAL experiment that had not ended by the
    expense date, so each setup cost is charged exactly once across experiments.
    """
    total = 0
    officials = list(s.scalars(select(Experiment).where(
        Experiment.purpose == "OFFICIAL", Experiment.started_at.is_not(None)).order_by(Experiment.started_at)))
    for e in _rows(s, exp, "SETUP"):
        if e.start_date > through:
            continue
        if e.experiment_id == exp.id:
            total += e.amount_paise
            continue
        owner = next((o for o in officials if (_exp_end(o) or date.max) >= e.start_date), None)
        if owner is not None and owner.id == exp.id:
            total += e.amount_paise
    return total


def unallocated_setup(s: Session, through: date) -> Paise:
    officials = list(s.scalars(select(Experiment).where(
        Experiment.purpose == "OFFICIAL", Experiment.started_at.is_not(None))))
    total = 0
    for e in s.scalars(select(Expense).where(Expense.scope == "SETUP", Expense.experiment_id.is_(None))):
        if e.start_date > through:
            continue
        if not any((_exp_end(o) or date.max) >= e.start_date for o in officials):
            total += e.amount_paise
    return total


@dataclass(frozen=True)
class ExpenseLine:
    id: int
    scope: str
    category: str
    description: str
    amount_paise: Paise
    basis: str
    start_date: date
    end_date: date | None
    verified_price: bool
    source_url: str | None


def expense_lines(s: Session, exp: Experiment | None = None) -> list[ExpenseLine]:
    q = select(Expense).order_by(Expense.scope, Expense.start_date)
    if exp is not None:
        cond = Expense.experiment_id == exp.id
        if exp.purpose == "OFFICIAL":
            cond = or_(cond, Expense.experiment_id.is_(None))
        q = q.where(cond)
    return [ExpenseLine(e.id, e.scope, e.category, e.description, e.amount_paise, e.basis, e.start_date,
                        e.end_date, e.verified_price, e.source_url) for e in s.scalars(q)]
