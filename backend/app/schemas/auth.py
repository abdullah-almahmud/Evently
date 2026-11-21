from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Schema for new user registration."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)


class LoginRequest(BaseModel):
    """Schema for email/password authentication."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Schema returned after successful authentication."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Schema for refreshing expired access tokens."""
    refresh_token: str


class GoogleCallbackQuery(BaseModel):
    """Schema for Google OAuth2 callback query parameters."""
    code: str
    state: Optional[str] = None
