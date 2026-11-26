import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.seating import build_generic_sections_for_capacity
from app.models import LayoutType, User, UserRole, Venue, VenueSection

logger = logging.getLogger(__name__)

STANDARD_CAMPUS_VENUES = [
    {
        "name": "UIU Smart Seminar Room 302",
        "address": "Academic Building 1, 3rd Floor, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 30,
        "layout_type": LayoutType.SEATED,
        "description": "Intimate smart classroom with projector and 30 fixed seats ideal for workshops and coding sessions.",
    },
    {
        "name": "UIU Innovation Studio",
        "address": "Innovation Hub, 2nd Floor, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 50,
        "layout_type": LayoutType.SEATED,
        "description": "Interactive 50-seat seminar studio equipped with tiered front seating and dual display screens.",
    },
    {
        "name": "UIU Seminar Hall B",
        "address": "Academic Building 2, 1st Floor, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 100,
        "layout_type": LayoutType.SEATED,
        "description": "Mid-sized 100-seat hall suited for club orientations, tech talks, and panel discussions.",
    },
    {
        "name": "UIU Main Auditorium",
        "address": "Main Campus Center, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 150,
        "layout_type": LayoutType.SEATED,
        "description": "Premier tiered 150-seat auditorium with VIP front orchestra, main floor, balcony, and concert sound.",
    },
    {
        "name": "UIU Grand Convocation Hall",
        "address": "Central Auditorium Wing, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 200,
        "layout_type": LayoutType.SEATED,
        "description": "Large 200-seat auditorium with VIP front rows, wide main seating, and upper gallery balcony.",
    },
    {
        "name": "UIU Central Courtyard & Open Ground",
        "address": "Campus Main Plaza, United City, Madani Ave, Dhaka 1212",
        "city": "Dhaka",
        "total_capacity": 500,
        "layout_type": LayoutType.GENERAL_ADMISSION,
        "description": "Expansive open-air campus plaza for concerts, cultural festivals, and mega fairs (General Admission).",
    },
]


async def ensure_default_venues(db: AsyncSession) -> int:
    """
    Idempotently seeds realistic UIU campus venues with varied seat counts
    (30, 50, 100, 150, 200 seated + 500 open ground) if missing, and ensures any
    existing SEATED venue with 0 sections gets generic sections matching its capacity.
    """
    creator_res = await db.execute(
        select(User).where(User.role.in_([UserRole.ADMIN, UserRole.ORGANIZER])).limit(1)
    )
    creator = creator_res.scalar_one_or_none()
    if not creator:
        return 0

    existing_res = await db.execute(select(Venue).options(selectinload(Venue.sections)))
    existing_venues = existing_res.scalars().all()
    existing_names = {v.name.strip().lower() for v in existing_venues}

    created_count = 0

    # Backfill generic sections on any SEATED venue missing sections
    for v in existing_venues:
        if v.layout_type == LayoutType.SEATED and not v.sections:
            for spec in build_generic_sections_for_capacity(v.total_capacity):
                db.add(
                    VenueSection(
                        venue_id=v.id,
                        name=spec["name"],
                        rows=spec["rows"],
                        seats_per_row=spec["seats_per_row"],
                    )
                )

    for item in STANDARD_CAMPUS_VENUES:
        if item["name"].strip().lower() in existing_names:
            continue

        cap = item["total_capacity"]
        section_specs = (
            build_generic_sections_for_capacity(cap)
            if item["layout_type"] == LayoutType.SEATED
            else []
        )
        if section_specs:
            cap = sum(s["rows"] * s["seats_per_row"] for s in section_specs)

        venue = Venue(
            name=item["name"],
            address=item["address"],
            city=item["city"],
            total_capacity=cap,
            layout_type=item["layout_type"],
            description=item["description"],
            created_by=creator.id,
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
        created_count += 1

    await db.commit()
    return created_count
