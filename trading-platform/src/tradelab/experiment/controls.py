"""Human controls. Each is logged in the audit trail with the acting user.

Three distinct actions (never conflated):
  pause_entries   -> no new buys; holdings, exits and pending sells continue
  cancel_pending  -> cancel open simulated orders; holdings unchanged
  liquidate       -> protected sell orders for all holdings at the next opportunity
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..context import AppContext
from ..models import Experiment
from ..ops.audit import audit
from .lifecycle import end_experiment


def pause_entries(s: Session, ctx: AppContext, exp: Experiment, actor: str, reason: str) -> None:
    exp.entries_paused = True
    exp.entries_paused_reason = f"MANUAL by {actor}: {reason}"
    audit(s, ctx.clock.now(), actor, "entries.paused", {"reason": reason}, exp.id)


def resume_entries(s: Session, ctx: AppContext, exp: Experiment, actor: str, reason: str) -> None:
    if exp.liquidation_requested:
        raise ValueError("cannot resume entries after a halt/liquidation; create a new experiment")
    prev = exp.entries_paused_reason
    exp.entries_paused = False
    exp.entries_paused_reason = None
    audit(s, ctx.clock.now(), actor, "entries.resumed", {"reason": reason, "previous_pause": prev}, exp.id)


def cancel_pending(s: Session, ctx: AppContext, exp: Experiment, actor: str) -> int:
    return ctx.broker.cancel_open(s, exp, ctx.clock.now(), f"cancelled by {actor}", actor=actor)


def request_liquidation(s: Session, ctx: AppContext, exp: Experiment, actor: str, reason: str) -> None:
    exp.entries_paused = True
    exp.entries_paused_reason = f"LIQUIDATION requested by {actor}: {reason}"
    exp.liquidation_requested = True
    ctx.broker.cancel_open(s, exp, ctx.clock.now(), "liquidation: cancel pending buys", side="BUY", actor=actor)
    audit(s, ctx.clock.now(), actor, "liquidation.requested", {"reason": reason}, exp.id)


def abandon(s: Session, ctx: AppContext, exp: Experiment, actor: str, reason: str) -> None:
    """End an experiment early. Results are preserved, never deleted or reset."""
    ctx.broker.cancel_open(s, exp, ctx.clock.now(), "experiment abandoned", actor=actor)
    end_experiment(s, exp, ctx.clock.now(), "ABANDONED", reason, actor)
