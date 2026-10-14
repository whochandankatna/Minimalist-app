"""Runtime settings loaded from environment / .env.

Secrets (Kite API secret, dashboard password) live only here, server-side.
They are never rendered into templates, logged, or returned by any endpoint.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "config"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TRADELAB_", env_file=".env", extra="ignore")

    data_dir: Path = PROJECT_ROOT / "data"
    market_data: Literal["mock", "kite"] = "mock"

    dashboard_user: str = "admin"
    dashboard_password: SecretStr | None = None

    kite_api_key: str | None = None
    kite_api_secret: SecretStr | None = None
    kite_redirect_url: str = "http://127.0.0.1:8000/auth/kite/callback"

    scheduler_enabled: bool = True
    monitor_interval_s: int = 60

    # Freshness thresholds (seconds) used by stale-data checks
    max_quote_age_s: int = 120
    max_last_trade_age_s: int = 900

    @property
    def db_path(self) -> Path:
        return self.data_dir / "tradelab.db"

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def kite_configured(self) -> bool:
        return bool(self.kite_api_key and self.kite_api_secret)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
