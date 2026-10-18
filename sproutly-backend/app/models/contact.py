import enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SqlEnum, Integer, String, true

from app.core.timeutil import utcnow
from app.db.session import Base


class ContactKind(str, enum.Enum):
    office = "office"
    clinic = "clinic"
    agrovet = "agrovet"
    hotline = "hotline"


class SupportContact(Base):
    """Who a farmer can turn to in their county; listed on the app's Support contacts screen."""

    __tablename__ = "support_contacts"

    contact_id = Column(Integer, primary_key=True, index=True)
    county = Column(String, nullable=False, index=True)
    kind = Column(SqlEnum(ContactKind, name="contact_kind"), nullable=False, default=ContactKind.office)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    organisation = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=True)
    hours = Column(String, nullable=False)
    # When someone last confirmed the details still work; contacts go stale quickly.
    checked_on = Column(DateTime, nullable=False, default=utcnow)
    # Hidden contacts are kept (and audited) but not shown to farmers.
    active = Column(Boolean, nullable=False, default=True, server_default=true())
