"""Exchange access (public market data only) and a local candle cache."""

from __future__ import annotations

import time
from pathlib import Path

import ccxt
import pandas as pd

COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def make_exchange(exchange_id: str) -> ccxt.Exchange:
    """Create an unauthenticated ccxt client. No API keys are ever loaded."""
    ex = getattr(ccxt, exchange_id)({"enableRateLimit": True})
    # ccxt disables requests' trust_env, which makes it ignore standard proxy and
    # CA settings (HTTPS_PROXY, REQUESTS_CA_BUNDLE). Re-enable so it works behind proxies.
    ex.session.trust_env = True
    return ex


def timeframe_ms(timeframe: str) -> int:
    return ccxt.Exchange.parse_timeframe(timeframe) * 1000


def to_frame(rows: list[list]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=COLUMNS)
    df["timestamp"] = df["timestamp"].astype("int64")
    df = df.drop_duplicates("timestamp").sort_values("timestamp")
    df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df.index.name = "time"
    return df


def drop_unclosed(df: pd.DataFrame, timeframe: str, now_ms: int | None = None) -> pd.DataFrame:
    """Remove the candle that is still forming. Signals must only use closed candles."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    return df[df["timestamp"] + timeframe_ms(timeframe) <= now_ms]


def fetch_history(ex: ccxt.Exchange, symbol: str, timeframe: str, since: int) -> pd.DataFrame:
    """Download closed candles from `since` (ms) until now, paging through the API."""
    step = timeframe_ms(timeframe)
    rows: list[list] = []
    while since < ex.milliseconds():
        batch = ex.fetch_ohlcv(symbol, timeframe, since=since, limit=300)
        if not batch:
            # Nothing in this window (e.g. before the coin was listed): skip ahead.
            since += 300 * step
            continue
        rows.extend(batch)
        last = batch[-1][0]
        if last + step > ex.milliseconds():
            break
        since = last + step
    return drop_unclosed(to_frame(rows), timeframe)


def cache_path(data_dir: Path, exchange_id: str, symbol: str, timeframe: str) -> Path:
    safe = symbol.replace("/", "-")
    return data_dir / f"{exchange_id}_{safe}_{timeframe}.csv"


def load_candles(
    exchange_id: str,
    symbol: str,
    timeframe: str,
    start: str,
    data_dir: Path = Path("data"),
    refresh: bool = True,
) -> pd.DataFrame:
    """Return candles from the CSV cache, topping it up from the exchange when refresh=True."""
    path = cache_path(data_dir, exchange_id, symbol, timeframe)
    cached = None
    if path.exists():
        cached = pd.read_csv(path)
        cached = to_frame(cached[COLUMNS].values.tolist())

    start_ts = pd.Timestamp(start, tz="UTC")
    if refresh:
        ex = make_exchange(exchange_id)
        if cached is not None and not cached.empty and cached.index[0] <= start_ts:
            since = int(cached["timestamp"].iloc[-1]) + timeframe_ms(timeframe)
        else:
            cached = None
            since = int(start_ts.timestamp() * 1000)
        fresh = fetch_history(ex, symbol, timeframe, since)
        if cached is None:
            combined = fresh
        else:
            combined = to_frame(pd.concat([cached, fresh])[COLUMNS].values.tolist())
        data_dir.mkdir(parents=True, exist_ok=True)
        combined[COLUMNS].to_csv(path, index=False)
        cached = combined

    if cached is None or cached.empty:
        raise RuntimeError(f"No cached data at {path}; run without --offline first")
    return cached[cached.index >= start_ts]
