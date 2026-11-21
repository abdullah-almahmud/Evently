import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import StaffRole


class EventStaff(Base):
    """
    Staff assignments for an event (e.g. gate staff for scanning QR codes, coordinators).
    """
    __tablename__ = "event_staff"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(
        SQLEnum(StaffRole, name="staff_role", create_type=False),
        nullable=False,
        default=StaffRole.GATE_STAFF,
        server_default=StaffRole.GATE_STAFF.value,
    )
    assigned_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_staff_user_event"),
    )

    # Relationships
    user = relationship("User", back_populates="staff_assignments", foreign_keys=[user_id])
    event = relationship("Event", back_populates="staff")
    assigner = relationship("User", foreign_keys=[assigned_by])
