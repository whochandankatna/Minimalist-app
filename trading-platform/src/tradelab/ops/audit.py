"""Audit log (hash-chained), incidents and alert drafts.

Secrets must never be passed in `details`. `redact` is applied defensively.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AlertDraft, AuditLog, Incident

_SECRET_KEYS = ("token", "secret", "password", "api_key", "otp", "checksum", "authorization")


def redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: ("[REDACTED]" if any(s in k.lower() for s in _SECRET_KEYS) else redact(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


def _canon(details: dict[str, Any]) -> str:
    return json.dumps(redact(details), sort_keys=True, default=str)


def audit(
    s: Session,
    now: datetime,
    actor: str,
    event: str,
    details: dict[str, Any] | None = None,
    experiment_id: int | None = None,
) -> AuditLog:
    prev = s.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(1)).first()
    prev_hash = prev.hash if prev else "0" * 64
    body = _canon(details or {})
    h = hashlib.sha256(
        f"{prev_hash}|{now.astimezone(timezone.utc).isoformat()}|{actor}|{event}|{experiment_id}|{body}".encode()
    ).hexdigest()
    row = AuditLog(
        ts=now, actor=actor, event=event, experiment_id=experiment_id,
        details_json=body, prev_hash=prev_hash, hash=h,
    )
    s.add(row)
    s.flush()
    return row


def verify_audit_chain(s: Session) -> tuple[bool, int | None]:
    """Returns (ok, first_bad_id)."""
    prev_hash = "0" * 64
    for row in s.scalars(select(AuditLog).order_by(AuditLog.id)):
        ts = row.ts
        expected = hashlib.sha256(
            f"{prev_hash}|{ts.astimezone(timezone.utc).isoformat()}|{row.actor}|{row.event}|{row.experiment_id}|{row.details_json}".encode()
        ).hexdigest()
        if row.prev_hash != prev_hash or row.hash != expected:
            return False, row.id
        prev_hash = row.hash
    return True, None


def incident(
    s: Session,
    now: datetime,
    severity: str,
    component: str,
    message: str,
    experiment_id: int | None = None,
    session_date: date | None = None,
    draft_alert: bool = True,
) -> Incident:
    """Record an incident; ERROR/CRITICAL also produce an (unsent) alert draft."""
    # Collapse repeats of the same open incident to avoid flooding.
    existing = s.scalars(
        select(Incident).where(
            Incident.component == component,
            Incident.message == message,
            Incident.resolved_at.is_(None),
            Incident.session_date == session_date,
        )
    ).first()
    if existing:
        return existing
    inc = Incident(
        ts=now, severity=severity, component=component, message=message,
        experiment_id=experiment_id, session_date=session_date,
    )
    s.add(inc)
    if draft_alert and severity in ("ERROR", "CRITICAL"):
        s.add(AlertDraft(created_at=now, severity=severity, subject=f"[tradelab] {component}: {severity}", body=message))
    s.flush()
    return inc


def resolve_incidents(s: Session, now: datetime, component: str, resolution: str) -> int:
    rows = s.scalars(select(Incident).where(Incident.component == component, Incident.resolved_at.is_(None))).all()
    for r in rows:
        r.resolved_at = now
        r.resolution = resolution
    return len(rows)
