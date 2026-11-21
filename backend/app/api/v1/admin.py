from datetime import datetime, timezone
import math
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models import OrganizerRequest, OrganizerRequestStatus, User, UserRole
from app.schemas.user import (
    OrganizerRequestResponse,
    OrganizerRequestReview,
    UserResponse,
)

router = APIRouter()


@router.get("/organizer-requests", response_model=List[OrganizerRequestResponse])
async def list_organizer_requests(
    status_filter: Optional[OrganizerRequestStatus] = Query(None, alias="status"),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[OrganizerRequestResponse]:
    """
    Lists organizer upgrade applications submitted by attendees.
    Supports optional status filtering (PENDING, APPROVED, REJECTED).
    Restricted to system administrators.
    """
    query = select(OrganizerRequest).order_by(OrganizerRequest.created_at.desc())
    if status_filter:
        query = query.where(OrganizerRequest.status == status_filter)

    result = await db.execute(query)
    requests = result.scalars().all()
    return [OrganizerRequestResponse.model_validate(r) for r in requests]


@router.put("/organizer-requests/{request_id}", response_model=OrganizerRequestResponse)
async def review_organizer_request(
    request_id: UUID,
    review: OrganizerRequestReview,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizerRequestResponse:
    """
    Approves or rejects an organizer application.
    If APPROVED, upgrades the applicant's role from ATTENDEE to ORGANIZER.
    """
    query = select(OrganizerRequest).where(OrganizerRequest.id == request_id)
    result = await db.execute(query)
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organizer request not found",
        )

    req.status = review.status
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)

    # If approved, upgrade target user's role to ORGANIZER
    if review.status == OrganizerRequestStatus.APPROVED:
        user_query = select(User).where(User.id == req.user_id)
        user_res = await db.execute(user_query)
        target_user = user_res.scalar_one_or_none()
        if target_user:
            target_user.role = UserRole.ORGANIZER

    await db.commit()
    await db.refresh(req)
    return OrganizerRequestResponse.model_validate(req)


@router.get("/users", response_model=List[UserResponse])
async def list_all_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """
    Lists registered users across the platform with pagination.
    Restricted to system administrators.
    """
    offset = (page - 1) * limit
    query = (
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.put("/users/{user_id}/toggle-active", response_model=UserResponse)
async def toggle_user_active_status(
    user_id: UUID,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Enables or disables a user account.
    Administrators are prevented from deactivating their own account.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot deactivate their own account",
        )

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target_user.is_active = not target_user.is_active
    await db.commit()
    await db.refresh(target_user)
    return UserResponse.model_validate(target_user)
