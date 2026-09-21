import os
from dataclasses import dataclass


@dataclass
class Settings:
    webhook_secret: str = os.getenv("WEBHOOK_SECRET", "change-me")
    env: str = os.getenv("APP_ENV", "dev")


settings = Settings()
