"""Simulated cash/coin account. Used by both the backtester and the paper trader
so that fees and slippage are always applied the same way."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class Fill:
    side: str          # "buy" or "sell"
    price: float       # price actually paid/received after slippage
    qty: float
    fee: float
    cash_after: float
    pnl: float | None = None   # realized profit on a sell, net of both fees


@dataclass
class Account:
    cash: float
    qty: float = 0.0
    entry_cost: float = 0.0    # cash spent on the open position, fees included
    fees_paid: float = 0.0

    @property
    def in_position(self) -> bool:
        return self.qty > 0

    def equity(self, price: float) -> float:
        return self.cash + self.qty * price

    def buy(self, price: float, fee_rate: float, slippage: float, allocation: float = 1.0) -> Fill | None:
        spend = self.cash * allocation
        if spend <= 0 or price <= 0:
            return None
        fill_price = price * (1 + slippage)
        qty = spend / (fill_price * (1 + fee_rate))
        fee = qty * fill_price * fee_rate
        # qty * fill_price + fee == spend exactly; subtract spend to avoid float dust like -1e-12.
        self.cash -= spend
        self.qty += qty
        self.entry_cost += spend
        self.fees_paid += fee
        return Fill("buy", fill_price, qty, fee, self.cash)

    def sell_all(self, price: float, fee_rate: float, slippage: float) -> Fill | None:
        if self.qty <= 0:
            return None
        fill_price = price * (1 - slippage)
        gross = self.qty * fill_price
        fee = gross * fee_rate
        net = gross - fee
        pnl = net - self.entry_cost
        qty = self.qty
        self.cash += net
        self.qty = 0.0
        self.entry_cost = 0.0
        self.fees_paid += fee
        return Fill("sell", fill_price, qty, fee, self.cash, pnl)

    def to_dict(self) -> dict:
        return asdict(self)
