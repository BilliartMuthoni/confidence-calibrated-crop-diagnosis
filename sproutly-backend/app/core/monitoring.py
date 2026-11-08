"""Error monitoring (D1, tracker g09): unexpected server errors are reported to Sentry so a person
hears about them. Off unless SENTRY_DSN is set (so a laptop never reports).

Only errors, no performance tracing. No personal data leaves the server: Sentry's own personal
data collection is off, and before anything is sent, request bodies, headers, cookies, query
strings and the user are removed and email addresses and phone numbers in the remaining text are
replaced. Farmers' photos are never attached. Expected answers (4xx, such as a wrong password or
"not a leaf") are not errors and are not reported; only 5xx and crashes are.
"""

import re

from app.core.config import settings

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Kenyan numbers as farmers type them: 07..., 01..., +254..., 254... (spaces or dashes allowed)
PHONE = re.compile(r"(?:\+?254|0)[17](?:[\s-]?\d){8}")


def scrub_text(value):
    """Replace email addresses and phone numbers in a piece of text."""
    if not isinstance(value, str):
        return value
    return PHONE.sub("[phone]", EMAIL.sub("[email]", value))


def _scrub(obj):
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    return scrub_text(obj)


def before_send(event, hint):
    """Strip everything that could identify a farmer before an error report leaves the server."""
    request = event.get("request")
    if request:
        event["request"] = {"method": request.get("method"), "url": scrub_text((request.get("url") or "").split("?")[0])}
    event.pop("user", None)
    event.pop("breadcrumbs", None)
    for key in ("message", "logentry", "exception", "extra", "contexts", "tags"):
        if key in event:
            event[key] = _scrub(event[key])
    return event


def init_monitoring() -> bool:
    """Start Sentry when SENTRY_DSN is set; returns whether it is on."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.model_revision,
        send_default_pii=False,
        traces_sample_rate=0.0,
        include_local_variables=False,
        max_request_body_size="never",
        max_breadcrumbs=0,
        before_send=before_send,
    )
    return True
