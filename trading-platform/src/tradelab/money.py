"""Money helpers. All amounts are integer paise (1 rupee = 100 paise).

Using integers avoids floating-point drift in the ledger. Rates are Decimal.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

Paise = int


def rupees(value: str | int | Decimal) -> Paise:
    """Convert a rupee amount to integer paise (half-up)."""
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def apply_rate(amount: Paise, rate: Decimal) -> Paise:
    """amount * rate, rounded half-up to the nearest paisa."""
    return int((Decimal(amount) * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def round_to_rupee(amount: Paise) -> Paise:
    """Round paise to the nearest whole rupee (used for STT, as on contract notes)."""
    return int((Decimal(amount) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) * 100


def round_to_tick(price: Paise, tick: Paise, direction: str) -> Paise:
    """Round a price to the exchange tick size. direction: 'down', 'up' or 'nearest'."""
    if tick <= 0:
        raise ValueError("tick must be positive")
    q, r = divmod(price, tick)
    if r == 0:
        return price
    if direction == "down":
        return q * tick
    if direction == "up":
        return (q + 1) * tick
    return (q + 1) * tick if r * 2 >= tick else q * tick


def fmt_inr(amount: Paise, show_sign: bool = False) -> str:
    """Format paise as Indian rupees with lakh/crore grouping, e.g. ₹1,23,456.78."""
    neg = amount < 0
    a = abs(amount)
    whole, frac = divmod(a, 100)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    sign = "-" if neg else ("+" if show_sign and amount > 0 else "")
    return f"{sign}₹{s}.{frac:02d}"


def fmt_pct(x: float | None, digits: int = 2, show_sign: bool = True) -> str:
    if x is None:
        return "n/a"
    sign = "+" if show_sign and x > 0 else ""
    return f"{sign}{x * 100:.{digits}f}%"
