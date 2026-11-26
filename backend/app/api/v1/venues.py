from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_organizer
from app.core.seating import build_generic_sections_for_capacity, sort_sections_front_to_back
from app.models import LayoutType, User, Venue, VenueSection
from app.schemas.venue import (
    VenueCreate,
    VenueResponse,
    VenueSectionCreate,
    VenueSectionResponse,
    VenueUpdate,
)

router = APIRouter()


MAX_SEATED_CAPACITY = 500


def format_venue_response(venue: Venue) -> VenueResponse:
    """Helper to convert Venue model to VenueResponse schema with front-to-back sections."""
    unloaded = sa_inspect(venue).unloaded
    raw_sections = [] if "sections" in unloaded else list(venue.sections or [])
    ordered_sections = sort_sections_front_to_back(raw_sections)
    return VenueResponse(
        id=venue.id,
        name=venue.name,
        address=venue.address,
        city=venue.city,
        total_capacity=venue.total_capacity,
        layout_type=venue.layout_type,
        description=venue.description,
        created_by=venue.created_by,
        created_at=venue.created_at,
        sections=[VenueSectionResponse.model_validate(s) for s in ordered_sections],
    )


@router.get("/", response_model=List[VenueResponse])
async def list_venues(
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> List[VenueResponse]:
    """
    Lists all available campus venues along with their configured sections.
    Accessible to event organizers and administrators.
    """
    query = (
        select(Venue)
        .options(selectinload(Venue.sections))
        .order_by(Venue.layout_type.asc(), Venue.total_capacity.asc(), Venue.name.asc())
    )
    result = await db.execute(query)
    venues = result.scalars().all()
    return [format_venue_response(v) for v in venues]


@router.post("/", response_model=VenueResponse, status_code=status.HTTP_201_CREATED)
async def create_venue(
    data: VenueCreate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> VenueResponse:
    """
    Registers a new venue or facility on campus.
    For SEATED venues, automatically persists supplied sections or generates generic
    auditorium sections matching total_capacity (up to 500 interactive seats).
    """
    section_specs = []
    resolved_capacity = data.total_capacity

    if data.layout_type == LayoutType.SEATED:
        if data.sections:
            section_specs = [
                {"name": s.name, "rows": s.rows, "seats_per_row": s.seats_per_row}
                for s in data.sections
            ]
            resolved_capacity = sum(s["rows"] * s["seats_per_row"] for s in section_specs)
        else:
            section_specs = build_generic_sections_for_capacity(data.total_capacity)
            resolved_capacity = sum(s["rows"] * s["seats_per_row"] for s in section_specs)

        if resolved_capacity > MAX_SEATED_CAPACITY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Seated interactive venues support up to {MAX_SEATED_CAPACITY} seats. Use General Admission for larger capacities.",
            )

    venue = Venue(
        name=data.name,
        address=data.address,
        city=data.city,
        total_capacity=resolved_capacity,
        layout_type=data.layout_type,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(venue)
    await db.flush()

    for spec in section_specs:
        db.add(
            VenueSection(
                venue_id=venue.id,
                name=spec["name"],
                rows=spec["rows"],
                seats_per_row=spec["seats_per_row"],
            )
        )

    await db.commit()

    query = select(Venue).where(Venue.id == venue.id).options(selectinload(Venue.sections))
    res = await db.execute(query)
    created = res.scalar_one()

    return format_venue_response(created)


@router.get("/{venue_id}", response_model=VenueResponse)
async def get_venue(
    venue_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> VenueResponse:
    """
    Retrieves venue specifications and seated sections layout.
    """
    query = (
        select(Venue)
        .where(Venue.id == venue_id)
        .options(selectinload(Venue.sections))
    )
    res = await db.execute(query)
    venue = res.scalar_one_or_none()

    if not venue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )

    return format_venue_response(venue)


@router.put("/{venue_id}", response_model=VenueResponse)
@router.patch("/{venue_id}", response_model=VenueResponse)
async def update_venue(
    venue_id: UUID,
    data: VenueUpdate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> VenueResponse:
    """
    Updates venue metadata and capacity settings.
    """
    query = (
        select(Venue)
        .where(Venue.id == venue_id)
        .options(selectinload(Venue.sections))
    )
    res = await db.execute(query)
    venue = res.scalar_one_or_none()

    if not venue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )

    update_dict = data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(venue, field, value)

    await db.commit()
    await db.refresh(venue)
    return format_venue_response(venue)


@router.post("/{venue_id}/sections", response_model=VenueSectionResponse, status_code=status.HTTP_201_CREATED)
async def add_venue_section(
    venue_id: UUID,
    data: VenueSectionCreate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> VenueSectionResponse:
    """
    Adds a seated section (e.g., Section A, Balcony) with defined rows and seats per row.
    """
    venue_res = await db.execute(select(Venue).where(Venue.id == venue_id))
    venue = venue_res.scalar_one_or_none()

    if not venue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue not found",
        )

    if venue.layout_type != LayoutType.SEATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sections can only be configured for venues with layout_type=SEATED",
        )

    section = VenueSection(
        venue_id=venue_id,
        name=data.name,
        rows=data.rows,
        seats_per_row=data.seats_per_row,
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)

    return VenueSectionResponse.model_validate(section)


@router.delete("/{venue_id}/sections/{section_id}", status_code=status.HTTP_200_OK)
async def delete_venue_section(
    venue_id: UUID,
    section_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
):
    """
    Removes a seated section from a venue.
    """
    query = select(VenueSection).where(
        VenueSection.id == section_id,
        VenueSection.venue_id == venue_id,
    )
    res = await db.execute(query)
    section = res.scalar_one_or_none()

    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venue section not found",
        )

    await db.delete(section)
    await db.commit()
    return {"message": "Venue section deleted successfully"}
