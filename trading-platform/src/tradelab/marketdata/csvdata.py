"""Import daily bars from a user-supplied CSV (e.g. NSE bhavcopy extracts downloaded by hand).

Expected columns (case-insensitive): date, symbol, open, high, low, close, volume.
Prices in rupees. Rows are tagged source="CSV" and used for backtests only.
"""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from ..money import rupees
from .base import Bar


def read_bars_csv(path: Path) -> list[Bar]:
    out: list[Bar] = []
    with path.open(newline="") as f:
        rd = csv.DictReader(f)
        if rd.fieldnames is None:
            raise ValueError("empty CSV")
        cols = {c.lower().strip(): c for c in rd.fieldnames}
        need = ["date", "symbol", "open", "high", "low", "close", "volume"]
        missing = [c for c in need if c not in cols]
        if missing:
            raise ValueError(f"CSV missing columns: {missing}")
        for row in rd:
            o, h, l, c = (rupees(row[cols[k]].strip()) for k in ("open", "high", "low", "close"))
            if not (l <= min(o, c) and h >= max(o, c) and l > 0):
                raise ValueError(f"inconsistent OHLC row: {row}")
            out.append(Bar(
                symbol=row[cols["symbol"]].strip().upper(),
                day=date.fromisoformat(row[cols["date"]].strip()),
                open=o, high=h, low=l, close=c,
                volume=int(float(row[cols["volume"]] or 0)),
                source="CSV",
            ))
    return out
