from datetime import datetime, timezone


def utcnow() -> datetime:
    """The current UTC time without a zone marker, as the DateTime columns store it, so values
    read back from the database can be compared with it directly."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
