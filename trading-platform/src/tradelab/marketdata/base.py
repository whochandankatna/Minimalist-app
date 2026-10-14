"""Market data types and the provider interface.

Every Quote/Bar carries a `source` (MOCK, KITE, CSV) so the UI and the
experiment rules can never confuse synthetic data with real data.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol

from ..money import Paise, rupees
from ..settings import CONFIG_DIR


class MarketDataError(RuntimeError):
    pass


class AuthError(MarketDataError):
    """Broker session missing, expired or invalidated. No new entries allowed."""


@dataclass(frozen=True)
class Instrument:
    symbol: str
    exchange: str
    name: str
    asset_class: str
    tick_paise: Paise
    mock_start_price: Paise
    mock_annual_drift: float
    mock_annual_vol: float


@dataclass(frozen=True)
class Universe:
    id: str
    instruments: tuple[Instrument, ...]
    benchmark: str

    @property
    def symbols(self) -> list[str]:
        return [i.symbol for i in self.instruments]

    def get(self, symbol: str) -> Instrument:
        for i in self.instruments:
            if i.symbol == symbol:
                return i
        raise KeyError(symbol)

    @classmethod
    def load(cls, name: str = "universe_v1") -> "Universe":
        d = json.loads((CONFIG_DIR / "strategy" / f"{name}.json").read_text())
        return cls(
            id=d["id"],
            instruments=tuple(
                Instrument(
                    symbol=i["symbol"], exchange=i["exchange"], name=i["name"],
                    asset_class=i["asset_class"], tick_paise=int(i["tick_paise"]),
                    mock_start_price=rupees(i["mock_start_price"]),
                    mock_annual_drift=float(Decimal(i["mock_annual_drift"])),
                    mock_annual_vol=float(Decimal(i["mock_annual_vol"])),
                )
                for i in d["instruments"]
            ),
            benchmark=d["benchmark"],
        )


@dataclass(frozen=True)
class Bar:
    symbol: str
    day: date
    open: Paise
    high: Paise
    low: Paise
    close: Paise
    volume: int
    source: str


@dataclass(frozen=True)
class DepthLevel:
    price: Paise
    qty: int


@dataclass(frozen=True)
class Quote:
    symbol: str
    source: str
    observed_at: datetime  # when we received it
    quote_ts: datetime | None  # exchange/vendor timestamp
    last_trade_ts: datetime | None
    ltp: Paise
    prev_close: Paise
    day_open: Paise
    volume: int
    bids: tuple[DepthLevel, ...]
    asks: tuple[DepthLevel, ...]
    lower_band: Paise | None
    upper_band: Paise | None

    @property
    def best_bid(self) -> Paise | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Paise | None:
        return self.asks[0].price if self.asks else None


class MarketDataProvider(Protocol):
    source: str  # MOCK | KITE

    @property
    def is_live_data(self) -> bool: ...

    def auth_status(self) -> tuple[bool, str]: ...

    def quotes(self, symbols: list[str]) -> dict[str, Quote]: ...

    def daily_bars(self, symbol: str, start: date, end: date) -> list[Bar]:
        """Completed daily bars only (never a still-forming bar for today)."""
        ...
