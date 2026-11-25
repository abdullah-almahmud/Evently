from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models import EventStaff, OrganizerRequest, OrganizerRequestStatus, User, UserRole
from app.schemas.user import (
    OrganizerRequestCreate,
    OrganizerRequestResponse,
    UserResponse,
    UserUpdateRequest,
)

router = APIRouter()


async def _build_user_response(user: User, db: AsyncSession) -> UserResponse:
    """Builds UserResponse with dynamically resolved EventStaff assignment status."""
    staff_count_res = await db.execute(
        select(func.count(EventStaff.id)).where(EventStaff.user_id == user.id)
    )
    is_staff = (staff_count_res.scalar_one() or 0) > 0
    resp = UserResponse.model_validate(user)
    resp.is_staff = is_staff
    return resp


@router.get("/me", response_model=UserResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Returns the profile information of the currently authenticated user,
    including whether they hold any active EventStaff assignments.
    """
    return await _build_user_response(current_user, db)


@router.put("/me", response_model=UserResponse)
@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Updates the authenticated user's profile details (e.g., full name, avatar URL).
    """
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url

    await db.commit()
    await db.refresh(current_user)
    return await _build_user_response(current_user, db)


@router.post(
    "/me/organizer-request",
    response_model=OrganizerRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/organizer-request",
    response_model=OrganizerRequestResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def submit_organizer_request(
    data: OrganizerRequestCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizerRequestResponse:
    """
    Submits an application to become an event organizer.
    Allowed only for attendees without an existing pending application.
    """
    if current_user.role != UserRole.ATTENDEE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User already holds the role of {current_user.role.value}",
        )

    # Check for existing pending request
    query = (
        select(OrganizerRequest)
        .where(
            OrganizerRequest.user_id == current_user.id,
            OrganizerRequest.status == OrganizerRequestStatus.PENDING,
        )
    )
    result = await db.execute(query)
    existing_pending = result.scalar_one_or_none()

    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending organizer request is already under review for your account",
        )

    new_request = OrganizerRequest(
        user_id=current_user.id,
        reason=data.reason,
        status=OrganizerRequestStatus.PENDING,
    )
    db.add(new_request)
    await db.commit()

    req_res = await db.execute(
        select(OrganizerRequest)
        .where(OrganizerRequest.id == new_request.id)
        .options(selectinload(OrganizerRequest.user))
    )
    loaded = req_res.scalar_one()
    return OrganizerRequestResponse.model_validate(loaded)


@router.get("/me/organizer-request", response_model=OrganizerRequestResponse)
@router.get(
    "/organizer-request/me",
    response_model=OrganizerRequestResponse,
    include_in_schema=False,
)
async def get_my_organizer_request(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizerRequestResponse:
    """
    Retrieves the status of the user's latest organizer role application.
    """
    query = (
        select(OrganizerRequest)
        .where(OrganizerRequest.user_id == current_user.id)
        .options(selectinload(OrganizerRequest.user))
        .order_by(OrganizerRequest.created_at.desc())
    )
    result = await db.execute(query)
    latest_request = result.scalars().first()

    if not latest_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organizer request history found for your account",
        )

    return OrganizerRequestResponse.model_validate(latest_request)
