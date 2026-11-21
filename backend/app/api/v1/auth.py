import uuid
from typing import Optional
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models import User, UserRole
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Registers a new user account with email, username, and password.
    Returns access and refresh JWT tokens upon successful creation.
    """
    # Verify uniqueness of email and username
    query = select(User).where(
        or_(User.email == data.email.lower(), User.username == data.username.lower())
    )
    result = await db.execute(query)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        if existing_user.email.lower() == data.email.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address already exists",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already taken",
            )

    hashed_pw = get_password_hash(data.password)
    new_user = User(
        email=data.email.lower(),
        username=data.username.lower(),
        hashed_password=hashed_pw,
        full_name=data.full_name,
        role=UserRole.ATTENDEE,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    access_token = create_access_token(
        data={"sub": str(new_user.id), "role": new_user.role.value, "email": new_user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(new_user.id)}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Authenticates a user with email and password.
    Returns new access and refresh JWT tokens.
    """
    query = select(User).where(User.email == data.email.lower())
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account has been disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "email": user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Generates a new access token using a valid refresh token.
    """
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type for refresh endpoint",
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject ID in token",
        )

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists or is inactive",
        )

    new_access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "email": user.email}
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=data.refresh_token,
        token_type="bearer",
    )


@router.post("/logout")
async def logout():
    """
    Stateless logout endpoint. Instructs the client to discard tokens.
    """
    return {"message": "Successfully logged out"}


@router.get("/google")
async def google_login():
    """
    Initiates Google OAuth2 login flow by redirecting to Google's consent screen.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth credentials are not configured",
        )

    client = AsyncOAuth2Client(
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scope="openid email profile",
    )
    authorization_url, state = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    return RedirectResponse(url=authorization_url)


@router.get("/google/callback")
async def google_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Google OAuth2 callback handler: exchanges authorization code for tokens,
    retrieves user profile from Google, creates or updates the user account,
    and redirects to the frontend with authentication tokens in query params.
    """
    if error or not code:
        redirect_err = f"{settings.FRONTEND_URL}/auth/callback?error={error or 'missing_code'}"
        return RedirectResponse(url=redirect_err)

    client = AsyncOAuth2Client(
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )

    try:
        token_data = await client.fetch_token(
            "https://oauth2.googleapis.com/token",
            code=code,
        )
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            token=token_data,
        )
        profile = userinfo_resp.json()
    except Exception as e:
        redirect_err = f"{settings.FRONTEND_URL}/auth/callback?error=oauth_exchange_failed"
        return RedirectResponse(url=redirect_err)

    google_id = profile.get("sub")
    email = profile.get("email", "").lower()
    full_name = profile.get("name") or "Google User"
    avatar_url = profile.get("picture")

    if not email:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?error=email_not_provided")

    # Locate existing user by google_id or email
    query = select(User).where(or_(User.google_id == google_id, User.email == email))
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user:
        if not user.google_id:
            user.google_id = google_id
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        await db.commit()
    else:
        # Generate base username from email handle
        base_username = email.split("@")[0].replace(".", "_")[:40]
        username = base_username

        # Ensure username uniqueness
        existing_check = await db.execute(select(User).where(User.username == username))
        if existing_check.scalar_one_or_none():
            username = f"{base_username}_{uuid.uuid4().hex[:6]}"

        user = User(
            email=email,
            username=username,
            hashed_password=None,  # Google-only auth
            google_id=google_id,
            full_name=full_name,
            avatar_url=avatar_url,
            role=UserRole.ATTENDEE,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "email": user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    frontend_redirect = (
        f"{settings.FRONTEND_URL}/auth/callback"
        f"?access_token={access_token}&refresh_token={refresh_token}"
    )
    return RedirectResponse(url=frontend_redirect)
