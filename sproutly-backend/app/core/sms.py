"""SMS codes for phone sign-ups (t22), sent with Africa's Talking.

Which way a code goes depends on AT_USERNAME:
- not set, on a laptop: the code is written to the backend's log (free, like email codes);
- "sandbox": Africa's Talking's sandbox, so the message appears in their simulator (free);
- your live app's username: a real SMS to the farmer's phone (needs credit on the account).

On the deployed server (APP_ENV=production) phone confirmation is only asked when a live account
is set (sms_ready); otherwise phone sign-in works as before, so a missing or sandbox setting can
never lock farmers out. The message carries only the code; Africa's Talking gets only the number
and the message.
"""

import logging

import httpx

from app.core.config import settings

log = logging.getLogger("sproutly")

LIVE_URL = "https://api.africastalking.com/version1/messaging"
SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging"


class SmsNotSent(Exception):
    """The SMS could not be handed to Africa's Talking."""


def sms_ready() -> bool:
    """Whether phone numbers are confirmed with an SMS code. Always on a laptop (log or sandbox);
    on the deployed server only with a live Africa's Talking account."""
    if settings.app_env != "production":
        return True
    return bool(settings.at_username and settings.at_api_key and settings.at_username != "sandbox")


def to_e164(phone: str) -> str:
    """A Kenyan number as farmers type it (0712345678, 712345678, 254712345678, +254 712 ...)
    in the +254 form Africa's Talking needs. Numbers already starting with + are kept."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if phone.strip().startswith("+"):
        return "+" + digits
    if digits.startswith("254"):
        return "+" + digits
    if digits.startswith("0"):
        return "+254" + digits[1:]
    return "+254" + digits


def send_sms_code(phone: str, code: str) -> None:
    """Send the 6-digit code; raises SmsNotSent if Africa's Talking does not accept it."""
    message = f"{code} is your Sproutly code. It works for {settings.email_code_minutes} minutes. Do not share it."
    if not settings.at_username or not settings.at_api_key:
        if settings.app_env == "production":
            raise SmsNotSent("AT_USERNAME / AT_API_KEY not set")
        # Laptop, no account set: show the code in the log, as for email codes.
        log.warning("SMS code for %s: %s (no AT_USERNAME set, so not sent)", phone, code)
        return
    url = SANDBOX_URL if settings.at_username == "sandbox" else LIVE_URL
    data = {"username": settings.at_username, "to": to_e164(phone), "message": message}
    if settings.at_sender_id:
        data["from"] = settings.at_sender_id
    try:
        response = httpx.post(url, data=data, timeout=15,
                              headers={"apiKey": settings.at_api_key, "Accept": "application/json"})
        body = response.json() if response.content else {}
    except (httpx.HTTPError, ValueError) as exc:
        raise SmsNotSent(f"request failed: {type(exc).__name__}") from exc
    recipients = (body.get("SMSMessageData") or {}).get("Recipients") or []
    if response.status_code >= 300 or not recipients or recipients[0].get("status") != "Success":
        # Status words only (never the number or the code) go to the log.
        status = recipients[0].get("status") if recipients else (body.get("SMSMessageData") or {}).get("Message")
        raise SmsNotSent(f"HTTP {response.status_code}: {status}")
