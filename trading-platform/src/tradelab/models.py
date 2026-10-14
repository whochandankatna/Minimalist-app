"""ORM models. Money is integer paise throughout."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, UTCDateTime

# ----------------------------------------------------------------- experiments


class Experiment(Base):
    __tablename__ = "experiments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    purpose: Mapped[str] = mapped_column(String(10))  # DEMO | OFFICIAL
    data_mode: Mapped[str] = mapped_column(String(10))  # MOCK | LIVE_DATA
    status: Mapped[str] = mapped_column(String(12), default="DRAFT")
    strategy_id: Mapped[str] = mapped_column(String(80))
    strategy_version: Mapped[str] = mapped_column(String(20))
    strategy_hash: Mapped[str] = mapped_column(String(64))
    strategy_spec_json: Mapped[str] = mapped_column(Text)
    risk_json: Mapped[str] = mapped_column(Text)
    fee_schedule_id: Mapped[str] = mapped_column(String(80))
    fee_schedule_sha: Mapped[str] = mapped_column(String(64))
    calendar_sha_json: Mapped[str] = mapped_column(Text)
    starting_capital_paise: Mapped[int] = mapped_column(Integer)
    target_sessions: Mapped[int] = mapped_column(Integer, default=20)
    review_checkpoints: Mapped[str] = mapped_column(String(40), default="5,10,20")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    start_session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    end_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    supersedes_experiment_id: Mapped[int | None] = mapped_column(
        ForeignKey("experiments.id"), nullable=True
    )
    entries_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    entries_paused_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    liquidation_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    peak_economic_equity_paise: Mapped[int] = mapped_column(Integer, default=0)
    benchmark_symbol: Mapped[str | None] = mapped_column(String(40), nullable=True)
    benchmark_qty: Mapped[int] = mapped_column(Integer, default=0)
    benchmark_cash_paise: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("purpose IN ('DEMO','OFFICIAL')"),
        CheckConstraint("data_mode IN ('MOCK','LIVE_DATA')"),
        # An official experiment can never run on mock data.
        CheckConstraint("NOT (purpose='OFFICIAL' AND data_mode='MOCK')", name="official_needs_live_data"),
    )


class ExperimentSession(Base):
    __tablename__ = "experiment_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    session_date: Mapped[date] = mapped_column(Date)
    session_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(10), default="REGULAR")
    status: Mapped[str] = mapped_column(String(12), default="SCHEDULED")
    quality: Mapped[str] = mapped_column(String(10), default="OK")  # OK | DEGRADED | NO_DATA
    quality_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cash_paise: Mapped[int] = mapped_column(Integer, default=0)
    reserved_paise: Mapped[int] = mapped_column(Integer, default=0)
    market_value_paise: Mapped[int] = mapped_column(Integer, default=0)
    trading_equity_paise: Mapped[int] = mapped_column(Integer, default=0)
    opex_cum_paise: Mapped[int] = mapped_column(Integer, default=0)
    setup_cum_paise: Mapped[int] = mapped_column(Integer, default=0)
    economic_equity_paise: Mapped[int] = mapped_column(Integer, default=0)
    allin_equity_paise: Mapped[int] = mapped_column(Integer, default=0)
    external_flow_paise: Mapped[int] = mapped_column(Integer, default=0)
    charges_cum_paise: Mapped[int] = mapped_column(Integer, default=0)
    turnover_cum_paise: Mapped[int] = mapped_column(Integer, default=0)
    realised_cum_paise: Mapped[int] = mapped_column(Integer, default=0)
    benchmark_value_paise: Mapped[int] = mapped_column(Integer, default=0)
    marks_json: Mapped[str] = mapped_column(Text, default="{}")  # closing prices used (paise)
    return_trading: Mapped[float | None] = mapped_column(nullable=True)
    return_economic: Mapped[float | None] = mapped_column(nullable=True)
    return_allin: Mapped[float | None] = mapped_column(nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    __table_args__ = (UniqueConstraint("experiment_id", "session_date"),)


# --------------------------------------------------------------------- orders


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # deterministic client order id
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    intent_key: Mapped[str] = mapped_column(String(200))
    session_date: Mapped[date] = mapped_column(Date)
    symbol: Mapped[str] = mapped_column(String(40))
    side: Mapped[str] = mapped_column(String(4))
    quantity: Mapped[int] = mapped_column(Integer)
    limit_price_paise: Mapped[int] = mapped_column(Integer)
    intent: Mapped[str] = mapped_column(String(12))  # ENTRY | EXIT | LIQUIDATE
    reason: Mapped[str] = mapped_column(Text)
    signal_id: Mapped[int | None] = mapped_column(ForeignKey("signals.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    filled_qty: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price_paise: Mapped[int] = mapped_column(Integer, default=0)
    reserved_paise: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    eligible_at: Mapped[datetime] = mapped_column(UTCDateTime)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (
        UniqueConstraint("experiment_id", "intent_key", name="uq_order_intent"),
        CheckConstraint("side IN ('BUY','SELL')"),
        CheckConstraint("quantity > 0"),
        CheckConstraint("filled_qty >= 0 AND filled_qty <= quantity"),
    )


class Fill(Base):
    __tablename__ = "fills"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    seq: Mapped[int] = mapped_column(Integer)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    session_date: Mapped[date] = mapped_column(Date)
    symbol: Mapped[str] = mapped_column(String(40))
    side: Mapped[str] = mapped_column(String(4))
    ts: Mapped[datetime] = mapped_column(UTCDateTime)
    qty: Mapped[int] = mapped_column(Integer)
    price_paise: Mapped[int] = mapped_column(Integer)
    turnover_paise: Mapped[int] = mapped_column(Integer)
    charges_paise: Mapped[int] = mapped_column(Integer)
    charges_json: Mapped[str] = mapped_column(Text)
    realised_gross_paise: Mapped[int] = mapped_column(Integer, default=0)
    market_ref: Mapped[str] = mapped_column(Text)  # what market data justified this fill
    __table_args__ = (UniqueConstraint("order_id", "seq"), CheckConstraint("qty > 0"))


class LedgerEntry(Base):
    """Append-only cash ledger. Cash balance == SUM(amount_paise)."""

    __tablename__ = "ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    ts: Mapped[datetime] = mapped_column(UTCDateTime)
    session_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(24))
    amount_paise: Mapped[int] = mapped_column(Integer)
    symbol: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("experiment_id", "kind", "ref", name="uq_ledger_ref"),)


class Lot(Base):
    """FIFO tax lots. cost_remaining_paise is the purchase cost of qty_remaining (excl. charges)."""

    __tablename__ = "lots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    symbol: Mapped[str] = mapped_column(String(40))
    fill_id: Mapped[int | None] = mapped_column(ForeignKey("fills.id"), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime)
    qty_remaining: Mapped[int] = mapped_column(Integer)
    cost_remaining_paise: Mapped[int] = mapped_column(Integer)
    __table_args__ = (CheckConstraint("qty_remaining >= 0"),)


class CorporateAction(Base):
    __tablename__ = "corporate_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(10))  # SPLIT | BONUS | DIVIDEND
    ex_date: Mapped[date] = mapped_column(Date)
    ratio_new: Mapped[int] = mapped_column(Integer, default=1)  # SPLIT/BONUS: units after per ratio_old
    ratio_old: Mapped[int] = mapped_column(Integer, default=1)
    dividend_per_unit_paise: Mapped[int] = mapped_column(Integer, default=0)
    source_url: Mapped[str] = mapped_column(Text)
    entered_at: Mapped[datetime] = mapped_column(UTCDateTime)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("symbol", "kind", "ex_date"),)


class CorporateActionApplied(Base):
    __tablename__ = "corporate_actions_applied"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    action_id: Mapped[int] = mapped_column(ForeignKey("corporate_actions.id"))
    applied_at: Mapped[datetime] = mapped_column(UTCDateTime)
    detail: Mapped[str] = mapped_column(Text)
    __table_args__ = (UniqueConstraint("experiment_id", "action_id"),)


class Expense(Base):
    """Costs paid OUTSIDE the virtual trading account (API, hosting, AI, data, setup).

    OPERATING expenses reduce economic performance; SETUP expenses only reduce
    all-in project performance. Rows are append-only; to stop a recurring cost
    set end_date (audited) rather than deleting.
    """

    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(10))  # OPERATING | SETUP
    category: Mapped[str] = mapped_column(String(20))  # API | HOSTING | AI | DATA | DOMAIN | OTHER
    description: Mapped[str] = mapped_column(Text)
    amount_paise: Mapped[int] = mapped_column(Integer)
    basis: Mapped[str] = mapped_column(String(10))  # MONTHLY | ONE_OFF
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    verified_price: Mapped[bool] = mapped_column(Boolean, default=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    experiment_id: Mapped[int | None] = mapped_column(ForeignKey("experiments.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    __table_args__ = (
        CheckConstraint("scope IN ('OPERATING','SETUP')"),
        CheckConstraint("basis IN ('MONTHLY','ONE_OFF')"),
        CheckConstraint("amount_paise >= 0"),
    )


class ExternalFlow(Base):
    """Cash added to/removed from the virtual account. Excluded from returns."""

    __tablename__ = "external_flows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    session_date: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(Integer)
    memo: Mapped[str] = mapped_column(Text)


# ------------------------------------------------------------- data & signals


class DailyBar(Base):
    __tablename__ = "daily_bars"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(40))
    day: Mapped[date] = mapped_column(Date)
    open_paise: Mapped[int] = mapped_column(Integer)
    high_paise: Mapped[int] = mapped_column(Integer)
    low_paise: Mapped[int] = mapped_column(Integer)
    close_paise: Mapped[int] = mapped_column(Integer)
    volume: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(12))  # MOCK | KITE | CSV
    retrieved_at: Mapped[datetime] = mapped_column(UTCDateTime)
    __table_args__ = (UniqueConstraint("symbol", "day", "source"),)


class QuoteSnapshot(Base):
    __tablename__ = "quote_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(40))
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime)
    quote_ts: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_trade_ts: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    ltp_paise: Mapped[int] = mapped_column(Integer)
    bid_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ask_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    volume: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(12))
    stale: Mapped[bool] = mapped_column(Boolean, default=False)


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    strategy_hash: Mapped[str] = mapped_column(String(64))
    computed_at: Mapped[datetime] = mapped_column(UTCDateTime)
    data_through: Mapped[date] = mapped_column(Date)
    valid_for: Mapped[date] = mapped_column(Date)
    payload_json: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("experiment_id", "valid_for"),
        CheckConstraint("data_through < valid_for", name="no_lookahead"),
    )


# ------------------------------------------------------------------ operations


class AuditLog(Base):
    """Hash-chained audit trail: each row stores the hash of the previous row."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime)
    actor: Mapped[str] = mapped_column(String(40))
    event: Mapped[str] = mapped_column(String(80))
    experiment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details_json: Mapped[str] = mapped_column(Text)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime)
    severity: Mapped[str] = mapped_column(String(10))
    component: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    experiment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)


class KiteSession(Base):
    """Server-side broker session. access_token is never rendered or logged."""

    __tablename__ = "kite_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    user_hint: Mapped[str] = mapped_column(String(20))
    access_token: Mapped[str] = mapped_column(Text)
    invalidated_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    invalidated_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class CalendarVerification(Base):
    __tablename__ = "calendar_verifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer)
    file_sha256: Mapped[str] = mapped_column(String(64))
    verified_by: Mapped[str] = mapped_column(String(80))
    verified_at: Mapped[datetime] = mapped_column(UTCDateTime)
    note: Mapped[str] = mapped_column(Text)


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job: Mapped[str] = mapped_column(String(40))
    session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(10))  # RUNNING | OK | SKIPPED | FAILED
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    period: Mapped[str] = mapped_column(String(12))  # TRAIN | VALIDATION | EVALUATION
    start: Mapped[date] = mapped_column(Date)
    end: Mapped[date] = mapped_column(Date)
    data_source: Mapped[str] = mapped_column(String(12))
    strategy_hash: Mapped[str] = mapped_column(String(64))
    fee_schedule_id: Mapped[str] = mapped_column(String(80))
    results_json: Mapped[str] = mapped_column(Text)
    equity_json: Mapped[str] = mapped_column(Text)
    trades_json: Mapped[str] = mapped_column(Text)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    checkpoint: Mapped[int] = mapped_column(Integer)
    generated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    summary_json: Mapped[str] = mapped_column(Text)
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    acknowledged_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("experiment_id", "checkpoint"),)


class AlertDraft(Base):
    """Alerts are drafted only. No sender exists; nothing leaves the server."""

    __tablename__ = "alert_drafts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    severity: Mapped[str] = mapped_column(String(10))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="DRAFT")
    __table_args__ = (CheckConstraint("status IN ('DRAFT','DISMISSED')"),)


# -------------------------------------------------------------------- research


class ResearchSource(Base):
    __tablename__ = "research_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(Text)
    access_method: Mapped[str] = mapped_column(String(10))  # MANUAL | RSS | API
    terms_status: Mapped[str] = mapped_column(String(30))
    terms_note: Mapped[str] = mapped_column(Text)
    automated_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_fetch_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_fetch_status: Mapped[str | None] = mapped_column(Text, nullable=True)


class ResearchItem(Base):
    """A retrieved or manually entered document. Its text is UNTRUSTED data."""

    __tablename__ = "research_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("research_sources.id"))
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    first_observed_at: Mapped[datetime] = mapped_column(UTCDateTime)
    retrieved_at: Mapped[datetime] = mapped_column(UTCDateTime)
    content_sha256: Mapped[str] = mapped_column(String(64))
    excerpt: Mapped[str] = mapped_column(Text)
    symbols: Mapped[str] = mapped_column(Text, default="")
    doc_type: Mapped[str] = mapped_column(String(24), default="OTHER")
    event_status: Mapped[str] = mapped_column(String(16), default="UNKNOWN")
    statement_basis: Mapped[str] = mapped_column(String(14), default="NA")
    reporting_period: Mapped[str | None] = mapped_column(String(40), nullable=True)
    units: Mapped[str | None] = mapped_column(String(40), nullable=True)
    metrics_json: Mapped[str] = mapped_column(Text, default="{}")
    auditor_concerns: Mapped[str | None] = mapped_column(Text, nullable=True)
    facts_json: Mapped[str] = mapped_column(Text, default="[]")
    inferences_json: Mapped[str] = mapped_column(Text, default="[]")
    missing_json: Mapped[str] = mapped_column(Text, default="[]")
    entered_by: Mapped[str] = mapped_column(String(10))  # MANUAL | FETCHER
    __table_args__ = (UniqueConstraint("url", "content_sha256"),)


class RiskFlag(Base):
    __tablename__ = "risk_flags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("research_items.id"), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    category: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(Text)
    basis: Mapped[str] = mapped_column(String(20))  # HEURISTIC_KEYWORD | HUMAN | AI_INFERENCE
    rule_version: Mapped[str] = mapped_column(String(20))
    affects_trading: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        # Research cannot influence trading in v1. Changing this needs a new,
        # explicitly versioned strategy and a schema change.
        CheckConstraint("affects_trading = 0", name="research_does_not_trade_v1"),
    )
