from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_hours: int = 8

    google_client_id: str
    google_client_secret: str

    admin_username: str
    admin_password_hash: str
    admin_email: Optional[str] = None

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"

    database_url: str = "sqlite+aiosqlite:///./pcs_tracker.db"

    aviationstack_api_key: Optional[str] = None

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
