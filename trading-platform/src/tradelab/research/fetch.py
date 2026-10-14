"""Automated fetching for sources a human has explicitly enabled.

Rules: only sources with automated_enabled=True; robots.txt is respected;
no login, paywall or access-control bypass; failures are recorded, not retried
aggressively. Coverage is neither complete nor instantaneous.
"""

from __future__ import annotations

import urllib.robotparser
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse

import feedparser
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ResearchSource
from .store import add_item

USER_AGENT = "tradelab-research/0.1 (personal research tool; low frequency)"


def robots_allows(url: str, client: httpx.Client) -> bool:
    p = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = client.get(f"{p.scheme}://{p.netloc}/robots.txt", timeout=10)
    except httpx.HTTPError:
        return False  # cannot confirm => do not fetch
    if r.status_code >= 400:
        return r.status_code == 404  # no robots.txt => allowed by convention
    rp.parse(r.text.splitlines())
    return rp.can_fetch(USER_AGENT, url)


def fetch_source(s: Session, src: ResearchSource, now: datetime, client: httpx.Client | None = None) -> str:
    if not src.automated_enabled:
        return "skipped: automated access not enabled by a human"
    own = client is None
    client = client or httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=False, timeout=20)
    try:
        if not robots_allows(src.url, client):
            status = "blocked by robots.txt or robots unavailable"
        else:
            r = client.get(src.url)
            if r.status_code != 200:
                status = f"HTTP {r.status_code}; not retried"
            elif src.access_method == "RSS":
                status = _ingest_rss(s, src, now, r.text)
            elif src.access_method == "API" and "federalregister.gov" in src.url:
                status = _ingest_fedreg(s, src, now, r.json())
            else:
                status = "unsupported access method"
    except httpx.HTTPError as e:
        status = f"network error {type(e).__name__}"
    finally:
        if own:
            client.close()
    src.last_fetch_at = now
    src.last_fetch_status = status
    return status


def _ingest_rss(s: Session, src: ResearchSource, now: datetime, body: str) -> str:
    feed = feedparser.parse(body)
    new = 0
    for e in feed.entries[:50]:
        pub = None
        if getattr(e, "published", None):
            try:
                pub = parsedate_to_datetime(e.published).astimezone(timezone.utc)
            except (TypeError, ValueError):
                pub = None
        link = getattr(e, "link", "") or ""
        if not link.startswith("http"):
            continue
        _, created = add_item(s, now, src.key, link, getattr(e, "title", ""), getattr(e, "summary", ""), pub, "FETCHER")
        new += int(created)
    return f"ok: {new} new of {len(feed.entries)}"


def _ingest_fedreg(s: Session, src: ResearchSource, now: datetime, data: dict[str, Any]) -> str:
    new = 0
    results = data.get("results", [])
    for d in results[:50]:
        pub = None
        if d.get("publication_date"):
            pub = datetime.fromisoformat(d["publication_date"]).replace(tzinfo=timezone.utc)
        text = f"{d.get('type', '')}: {d.get('abstract') or ''}"
        _, created = add_item(s, now, src.key, d.get("html_url", ""), d.get("title", ""), text, pub, "FETCHER")
        new += int(created)
    return f"ok: {new} new of {len(results)}"


def fetch_enabled(s: Session, now: datetime) -> list[tuple[str, str]]:
    out = []
    for src in s.scalars(select(ResearchSource).where(ResearchSource.automated_enabled.is_(True))):
        out.append((src.key, fetch_source(s, src, now)))
    return out
