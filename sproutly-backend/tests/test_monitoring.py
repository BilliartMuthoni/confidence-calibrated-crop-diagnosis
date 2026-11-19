"""The error-report filter (app/core/monitoring.py): nothing that identifies a farmer may reach Sentry."""

from app.core.monitoring import before_send, scrub_text


def test_email_is_replaced():
    assert scrub_text("sign-in failed for jane.doe+test@example.co.ke") == "sign-in failed for [email]"


def test_kenyan_phone_numbers_are_replaced_in_every_form():
    for number in ("0712345678", "0112345678", "+254712345678", "254712345678", "0712 345 678", "0712-345-678"):
        assert scrub_text(f"SMS to {number} failed") == "SMS to [phone] failed", number


def test_ordinary_numbers_are_kept():
    # Counts, codes and ids in an error message are useful and do not identify anyone.
    assert scrub_text("diagnosis 4021 failed after 3 tries (status 503)") == "diagnosis 4021 failed after 3 tries (status 503)"


def test_non_text_values_pass_through():
    assert scrub_text(42) == 42
    assert scrub_text(None) is None


def test_user_breadcrumbs_and_request_details_are_removed():
    event = {
        "user": {"id": "17", "email": "farmer@example.com"},
        "breadcrumbs": {"values": [{"message": "typed 0712345678"}]},
        "request": {
            "method": "POST",
            "url": "https://api.example.com/auth/login?phone=0712345678",
            "headers": {"Authorization": "Bearer abc"},
            "cookies": {"session": "abc"},
            "data": {"password": "secret"},
            "query_string": "phone=0712345678",
        },
    }
    cleaned = before_send(event, None)
    assert "user" not in cleaned
    assert "breadcrumbs" not in cleaned
    assert cleaned["request"] == {"method": "POST", "url": "https://api.example.com/auth/login"}


def test_nested_exception_and_extra_text_is_cleaned():
    event = {
        "exception": {"values": [{"type": "ValueError", "value": "no account for farmer@example.com or 0712345678"}]},
        "extra": {"contact": ["+254712345678", {"email": "a@b.ke"}]},
        "message": "retry for 0712 345 678",
    }
    cleaned = before_send(event, None)
    assert cleaned["exception"]["values"][0]["value"] == "no account for [email] or [phone]"
    assert cleaned["extra"] == {"contact": ["[phone]", {"email": "[email]"}]}
    assert cleaned["message"] == "retry for [phone]"
