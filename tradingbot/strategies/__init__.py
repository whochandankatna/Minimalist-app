from .base import Strategy
from .ma_crossover import MACrossover

STRATEGIES: dict[str, type[Strategy]] = {
    MACrossover.name: MACrossover,
}


def build_strategy(name: str, params: dict) -> Strategy:
    if name not in STRATEGIES:
        raise ValueError(f"Unknown strategy '{name}'. Available: {', '.join(STRATEGIES)}")
    return STRATEGIES[name](**params)


__all__ = ["Strategy", "STRATEGIES", "build_strategy"]
