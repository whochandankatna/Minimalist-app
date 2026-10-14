"""Application context: wires settings, DB, clock, calendar, data provider and broker."""

from __future__ import annotations

from dataclasses import dataclass

from .calendar import TradingCalendar
from .clock import Clock, SystemClock
from .db import Database
from .execution.paper import PaperBroker
from .fees import FeeSchedule
from .marketdata.base import MarketDataProvider, Universe
from .settings import Settings, get_settings
from .strategy.spec import FrozenSpec, load_spec


@dataclass
class AppContext:
    settings: Settings
    db: Database
    clock: Clock
    calendar: TradingCalendar
    universe: Universe
    spec: FrozenSpec
    fees: FeeSchedule
    market: MarketDataProvider
    broker: PaperBroker


def build_context(
    settings: Settings | None = None,
    clock: Clock | None = None,
    market: MarketDataProvider | None = None,
    db: Database | None = None,
) -> AppContext:
    settings = settings or get_settings()
    clock = clock or SystemClock()
    db = db or Database(settings.db_path)
    cal = TradingCalendar.load()
    uni = Universe.load()
    spec = load_spec()
    fees = FeeSchedule.load()
    if market is None:
        if settings.market_data == "kite":
            market = _kite_provider(settings, db, clock)
        else:
            from .marketdata.mock import MockMarketData

            market = MockMarketData(uni, clock, cal)
    broker = PaperBroker(fees, uni)
    return AppContext(settings, db, clock, cal, uni, spec, fees, market, broker)


def _kite_provider(settings: Settings, db: Database, clock: Clock) -> MarketDataProvider:
    from .marketdata.kite import KiteMarketData, KiteReadOnlyClient
    from .marketdata.kite_session import current_session

    if not settings.kite_configured:
        raise RuntimeError("TRADELAB_MARKET_DATA=kite but Kite API key/secret are not configured")

    def token() -> str | None:
        with db.session() as s:
            ks = current_session(s, clock.now())
            return ks.access_token if ks else None

    assert settings.kite_api_key is not None
    return KiteMarketData(KiteReadOnlyClient(settings.kite_api_key, token, clock), clock)
