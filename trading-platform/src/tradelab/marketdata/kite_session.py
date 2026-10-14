"""Server-side storage of the Kite access token (official redirect login flow).

The app never sees the user's Zerodha password or TOTP: the user logs in on
kite.zerodha.com, which redirects back with a short-lived request_token that
the server exchanges (with the API secret) for an access_token.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import KiteSession
from .kite import next_expiry


def store_session(s: Session, now: datetime, access_token: str, user_id: str) -> KiteSession:
    for old in s.scalars(select(KiteSession).where(KiteSession.invalidated_at.is_(None))):
        old.invalidated_at = now
        old.invalidated_reason = "superseded by new login"
    hint = (user_id[:2] + "***") if user_id else "?"
    ks = KiteSession(created_at=now, expires_at=next_expiry(now), user_hint=hint, access_token=access_token)
    s.add(ks)
    s.flush()
    return ks


def current_session(s: Session, now: datetime) -> KiteSession | None:
    ks = s.scalars(
        select(KiteSession).where(KiteSession.invalidated_at.is_(None)).order_by(KiteSession.id.desc())
    ).first()
    if ks is None:
        return None
    if now >= ks.expires_at:
        ks.invalidated_at = now
        ks.invalidated_reason = "expired (06:00 IST daily expiry)"
        return None
    return ks


def invalidate(s: Session, now: datetime, reason: str) -> None:
    for ks in s.scalars(select(KiteSession).where(KiteSession.invalidated_at.is_(None))):
        ks.invalidated_at = now
        ks.invalidated_reason = reason
