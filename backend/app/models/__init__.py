from enum import Enum


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    ORGANIZER = "ORGANIZER"
    ATTENDEE = "ATTENDEE"


class OrganizerRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class EventStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    SOLD_OUT = "SOLD_OUT"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class EventCategory(str, Enum):
    CONCERT = "CONCERT"
    FESTIVAL = "FESTIVAL"
    CONFERENCE = "CONFERENCE"
    WORKSHOP = "WORKSHOP"
    SPORTS = "SPORTS"
    CULTURAL = "CULTURAL"
    OTHER = "OTHER"


class LayoutType(str, Enum):
    SEATED = "SEATED"
    GENERAL_ADMISSION = "GENERAL_ADMISSION"


class BookingStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class SeatHoldStatus(str, Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    CONVERTED = "CONVERTED"


class TicketStatus(str, Enum):
    ACTIVE = "ACTIVE"
    USED = "USED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class PaymentGateway(str, Enum):
    SSLCOMMERZ = "SSLCOMMERZ"


class StaffRole(str, Enum):
    GATE_STAFF = "GATE_STAFF"
    COORDINATOR = "COORDINATOR"


# Import models so Alembic and SQLAlchemy can discover them
from app.models.user import User, OrganizerRequest
from app.models.venue import Venue, VenueSection
from app.models.event import Event, TicketTier
from app.models.seat import Seat, SeatHold
from app.models.booking import Booking, BookingItem
from app.models.payment import Payment
from app.models.ticket import Ticket
from app.models.staff import EventStaff
from app.models.resource import Resource, ResourceBooking
from app.models.waitlist import EventWaitlist

__all__ = [
    # Enums
    "UserRole",
    "OrganizerRequestStatus",
    "EventStatus",
    "EventCategory",
    "LayoutType",
    "BookingStatus",
    "SeatHoldStatus",
    "TicketStatus",
    "PaymentStatus",
    "PaymentGateway",
    "StaffRole",
    # Models
    "User",
    "OrganizerRequest",
    "Venue",
    "VenueSection",
    "Event",
    "TicketTier",
    "Seat",
    "SeatHold",
    "Booking",
    "BookingItem",
    "Payment",
    "Ticket",
    "EventStaff",
    "Resource",
    "ResourceBooking",
    "EventWaitlist",
]
