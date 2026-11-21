from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application configuration loaded from environment variables and .env file.
    """
    # Database Configuration
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/evently"

    # Redis Configuration
    REDIS_URL: str = "redis://localhost:6379"

    # JWT & Security
    SECRET_KEY: str = "evently-super-secure-secret-key-minimum-32-chars-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth2 Credentials
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Frontend Application URL
    FRONTEND_URL: str = "http://localhost:5173"

    # Resend Email Service
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@evently.com"

    # SSLCommerz Payment Gateway
    SSLCOMMERZ_STORE_ID: str = ""
    SSLCOMMERZ_STORE_PASSWORD: str = ""
    SSLCOMMERZ_IS_SANDBOX: bool = True

    # Environment
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @property
    def sslcommerz_base_url(self) -> str:
        """Returns the appropriate SSLCommerz base URL based on sandbox mode."""
        if self.SSLCOMMERZ_IS_SANDBOX:
            return "https://sandbox.sslcommerz.com"
        return "https://securepay.sslcommerz.com"


settings = Settings()
