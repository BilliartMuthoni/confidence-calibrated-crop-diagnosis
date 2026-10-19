import enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, true

from app.core.timeutil import utcnow
from app.db.session import Base


class ContactKind(str, enum.Enum):
    office = "office"
    clinic = "clinic"
    agrovet = "agrovet"
    hotline = "hotline"


class PhoneType(str, enum.Enum):
    """What kind of number is published. Role numbers are preferred: they survive staff changes
    and are not personal data of one person. A personal mobile needs that person's recorded consent."""

    office = "office"  # the office's landline or official line
    hotline = "hotline"  # a toll-free or call-centre line
    business = "business"  # an organisation's line, e.g. an agrovet's shop phone
    personal = "personal"  # someone's own mobile: consent required (Data Protection Act 2019, s.30, s.32)


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
    phone_type = Column(SqlEnum(PhoneType, name="phone_type"), nullable=False, default=PhoneType.office,
                        server_default="office")
    # For a personal mobile: when that person's consent to show it to farmers was recorded, and
    # by which admin. Withdrawn consent = change the number to an office line or hide the contact.
    personal_consent_on = Column(DateTime, nullable=True)
    personal_consent_by_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    email = Column(String, nullable=True)
    hours = Column(String, nullable=False)
    # When someone last confirmed the details still work; contacts go stale quickly.
    checked_on = Column(DateTime, nullable=False, default=utcnow)
    # Hidden contacts are kept (and audited) but not shown to farmers.
    active = Column(Boolean, nullable=False, default=True, server_default=true())
