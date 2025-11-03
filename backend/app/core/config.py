from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database configuration
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/clipboard_db"
    
    # Application configuration
    APP_NAME: str = "Clipboard API"
    APP_VERSION: str = "1.0.1"
    DEBUG: bool = True
    
    # CORS configuration
    ALLOWED_ORIGINS: list = ["*"]

    # OAuth2 configuration
    OAUTH2_ENABLED: bool = False
    OAUTH2_USERINFO_URL: Optional[str] = None
    OAUTH2_TOKEN_URL: Optional[str] = None
    OAUTH2_REDIRECT_URI: Optional[str] = None
    OAUTH2_CLIENT_ID: Optional[str] = None
    OAUTH2_CLIENT_SECRET: Optional[str] = None
    OAUTH2_SCOPE: Optional[str] = None
    OAUTH2_AUDIENCE: Optional[str] = None
    OAUTH2_ISSUER: Optional[str] = None
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )
    

@lru_cache()
def get_settings() -> Settings:
    return Settings()
