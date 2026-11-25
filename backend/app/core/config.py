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

    @property
    def async_database_url(self) -> str:
        """
        Normalizes the DATABASE_URL to use the asyncpg driver.
        Handles postgresql:// or postgres:// and strips any accidental bracket formatting.
        Also switches port 6543 (transaction pooler) to port 5432 (session pooler)
        which is required for asyncpg with Supabase pooler.
        """
        url = self.DATABASE_URL.strip().replace("[", "").replace("]", "")
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        
        # When using Supabase connection pooler, port 5432 (session mode) is compatible
        # with prepared statements and schema queries
        if ".pooler.supabase.com:6543" in url:
            url = url.replace(".pooler.supabase.com:6543", ".pooler.supabase.com:5432")

        return url


settings = Settings()
