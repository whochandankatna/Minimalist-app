"""Research items with provenance, plus heuristic risk flags.

All fetched or pasted text is UNTRUSTED DATA: it is length-capped, stripped
of control characters, HTML-escaped by the templates, never executed, and
never treated as instructions. Classification here is simple keyword
matching and is labelled as heuristic inference, not fact.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ResearchItem, ResearchSource, RiskFlag
from ..settings import CONFIG_DIR

MAX_EXCERPT = 5000
TAGGER_VERSION = "kw-1"

DOC_TYPES = ("FINANCIAL_RESULTS", "ANNOUNCEMENT", "CONTRACT", "ACQUISITION", "PARTNERSHIP", "POLICY",
             "TARIFF", "SANCTION", "MONETARY_POLICY", "OTHER")
EVENT_STATUS = ("SIGNED", "NON_BINDING", "RUMOUR", "PROPOSED", "EFFECTIVE", "UNKNOWN")
BASIS = ("CONSOLIDATED", "STANDALONE", "UNKNOWN", "NA")

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize(text: str) -> str:
    return _CTRL.sub("", text or "")[:MAX_EXCERPT]


def seed_sources(s: Session) -> int:
    data = json.loads((CONFIG_DIR / "research" / "sources.json").read_text())
    n = 0
    for src in data["sources"]:
        if s.scalars(select(ResearchSource).where(ResearchSource.key == src["key"])).first():
            continue
        s.add(ResearchSource(key=src["key"], name=src["name"], kind=src["kind"], url=src["url"],
                             access_method=src["access_method"], terms_status=src["terms_status"],
                             terms_note=src["terms_note"], automated_enabled=False))
        n += 1
    s.flush()
    return n


@dataclass(frozen=True)
class Heuristics:
    doc_type: str
    event_status: str
    flags: list[tuple[str, str, str]]  # (category, severity, description)
    inferences: list[str]


_RULES: list[tuple[str, str, str, str]] = [
    # (regex, category, severity, description)
    (r"\btariff|customs duty|anti-dumping|safeguard duty", "TARIFF", "MEDIUM", "mentions tariffs/duties"),
    (r"\bsanction|OFAC|SDN list|export control", "SANCTIONS", "MEDIUM", "mentions sanctions/export controls"),
    (r"\bwar\b|military|missile|conflict|Red Sea|Strait of Hormuz", "GEOPOLITICAL", "MEDIUM", "mentions conflict/shipping disruption"),
    (r"crude|brent|oil price|OPEC", "OIL", "LOW", "mentions oil"),
    (r"rupee|INR|exchange rate|forex", "CURRENCY", "LOW", "mentions currency"),
    (r"repo rate|monetary policy|CRR|SLR", "MONETARY_POLICY", "LOW", "mentions monetary policy"),
    (r"qualified opinion|emphasis of matter|going concern|auditor resign", "AUDITOR", "HIGH", "possible auditor concern"),
    (r"default|insolvency|NCLT|downgrade", "CREDIT", "HIGH", "possible credit event"),
]


def classify(title: str, text: str) -> Heuristics:
    blob = f"{title}\n{text}"
    low = blob.lower()
    doc_type = "OTHER"
    if re.search(r"financial results|quarterly results|q[1-4] results|balance sheet", low):
        doc_type = "FINANCIAL_RESULTS"
    elif re.search(r"acquisition|acquire|takeover", low):
        doc_type = "ACQUISITION"
    elif re.search(r"\bcontract\b|order win|work order|letter of award", low):
        doc_type = "CONTRACT"
    elif re.search(r"partnership|\bmou\b|memorandum of understanding|joint venture", low):
        doc_type = "PARTNERSHIP"
    elif re.search(r"tariff|customs duty", low):
        doc_type = "TARIFF"
    elif re.search(r"sanction", low):
        doc_type = "SANCTION"
    elif re.search(r"repo rate|monetary policy", low):
        doc_type = "MONETARY_POLICY"
    status = "UNKNOWN"
    if re.search(r"\bmou\b|memorandum of understanding|non-binding|letter of intent|in talks|exploring", low):
        status = "NON_BINDING"
    elif re.search(r"reportedly|sources said|rumou?r|speculat", low):
        status = "RUMOUR"
    elif re.search(r"proposed|draft notification|consultation|considering|may impose", low):
        status = "PROPOSED"
    elif re.search(r"with effect from|w\.e\.f\.|comes into force|effective from|hereby notified", low):
        status = "EFFECTIVE"
    elif re.search(r"signed|executed (an|the) agreement|definitive agreement", low):
        status = "SIGNED"
    flags = [(cat, sev, desc) for rx, cat, sev, desc in _RULES if re.search(rx, blob, re.I)]
    inf = [f"[heuristic {TAGGER_VERSION}] document type looks like {doc_type}",
           f"[heuristic {TAGGER_VERSION}] event status looks like {status}"]
    return Heuristics(doc_type, status, flags, inf)


def add_item(
    s: Session, now: datetime, source_key: str, url: str, title: str, text: str,
    published_at: datetime | None, entered_by: str, symbols: list[str] | None = None,
    overrides: dict[str, Any] | None = None,
) -> tuple[ResearchItem, bool]:
    """Insert (or return existing) item. Returns (item, created)."""
    src = s.scalars(select(ResearchSource).where(ResearchSource.key == source_key)).first()
    if src is None:
        raise ValueError(f"unknown source {source_key}")
    if not re.match(r"^https?://", url):
        raise ValueError("source URL must be http(s)")
    clean = sanitize(text)
    title = sanitize(title)[:500]
    h = hashlib.sha256(clean.encode()).hexdigest()
    existing = s.scalars(select(ResearchItem).where(ResearchItem.url == url, ResearchItem.content_sha256 == h)).first()
    if existing:
        return existing, False
    first_seen = s.scalars(select(ResearchItem).where(ResearchItem.url == url).order_by(ResearchItem.id)).first()
    hx = classify(title, clean)
    ov = overrides or {}
    item = ResearchItem(
        source_id=src.id, url=url, title=title or "(untitled)", published_at=published_at,
        first_observed_at=first_seen.first_observed_at if first_seen else now, retrieved_at=now,
        content_sha256=h, excerpt=clean, symbols=",".join(sorted(set(symbols or []))),
        doc_type=ov.get("doc_type") or hx.doc_type, event_status=ov.get("event_status") or hx.event_status,
        statement_basis=ov.get("statement_basis", "NA"), reporting_period=ov.get("reporting_period"),
        units=ov.get("units"), metrics_json=json.dumps(ov.get("metrics", {})),
        auditor_concerns=ov.get("auditor_concerns"), facts_json=json.dumps(ov.get("facts", [])),
        inferences_json=json.dumps(hx.inferences), missing_json=json.dumps(_missing(published_at, ov)),
        entered_by=entered_by,
    )
    for k in ("doc_type", "event_status", "statement_basis"):
        allowed = {"doc_type": DOC_TYPES, "event_status": EVENT_STATUS, "statement_basis": BASIS}[k]
        if getattr(item, k) not in allowed:
            raise ValueError(f"invalid {k}")
    s.add(item)
    s.flush()
    for cat, sev, desc in hx.flags:
        s.add(RiskFlag(item_id=item.id, symbol=item.symbols or None, created_at=now, category=cat, severity=sev,
                       description=desc, basis="HEURISTIC_KEYWORD", rule_version=TAGGER_VERSION,
                       affects_trading=False))
    s.flush()
    return item, True


def _missing(published_at: datetime | None, ov: dict[str, Any]) -> list[str]:
    m = []
    if published_at is None:
        m.append("publication time not stated by source")
    if ov.get("doc_type") == "FINANCIAL_RESULTS" or ov.get("metrics"):
        if not ov.get("statement_basis") or ov.get("statement_basis") in ("UNKNOWN", "NA"):
            m.append("consolidated vs standalone not confirmed")
        if not ov.get("units"):
            m.append("units (Rs crore/lakh) not confirmed")
        if not ov.get("reporting_period"):
            m.append("reporting period not confirmed")
    return m
