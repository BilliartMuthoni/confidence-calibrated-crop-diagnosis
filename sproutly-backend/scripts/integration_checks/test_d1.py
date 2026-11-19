"""D1 scratch test (fake env, cwd = this folder): monitoring off by default; nothing personal is sent."""
import json
import os
import sys

from cryptography.fernet import Fernet

os.environ.update({"DATABASE_URL": "sqlite:///d1.db", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "production-test",
                   "SMTP_HOST": "", "GROQ_API_KEY": ""})
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")))
ok = []


def check(name, cond):
    ok.append(bool(cond))
    print("PASS" if cond else "FAIL", name)


import sentry_sdk  # noqa: E402
from sentry_sdk.transport import Transport  # noqa: E402
from app.core import monitoring  # noqa: E402
from app.core.config import settings  # noqa: E402

check("off when SENTRY_DSN is empty", monitoring.init_monitoring() is False)
check("scrub email", monitoring.scrub_text("login failed for wanjiku@example.org") == "login failed for [email]")
check("scrub 07 phone", monitoring.scrub_text("no account 0712 345 678") == "no account [phone]")
check("scrub +254 phone", monitoring.scrub_text("sms to +254712345678 failed") == "sms to [phone] failed")
check("numbers that are not phones stay", monitoring.scrub_text("check 4521 took 190 ms") == "check 4521 took 190 ms")

sent = []


class Capture(Transport):
    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                sent.append(item.payload.json)


settings.sentry_dsn = "https://public@example.invalid/1"
check("on when SENTRY_DSN is set", monitoring.init_monitoring() is True)
client = sentry_sdk.get_client()
client.transport = Capture(client.options)

with sentry_sdk.new_scope() as scope:
    scope.set_user({"id": 7, "email": "wanjiku@example.org"})
    scope.set_extra("phone", "0712345678")
    try:
        raise RuntimeError("could not send code to wanjiku@example.org / 0712345678")
    except RuntimeError:
        event = {"request": {"method": "POST", "url": "https://api/x/diagnose?token=abc",
                             "headers": {"Authorization": "Bearer secret"}, "data": {"phone": "0712345678"},
                             "cookies": {"s": "1"}}}
        sentry_sdk.capture_exception()
        # also run before_send directly on a request-shaped event
        cleaned = monitoring.before_send(dict(event), None)
sentry_sdk.flush()

check("an event was produced", len(sent) == 1)
text = json.dumps(sent[0]) if sent else ""
check("no email in what is sent", "wanjiku@example.org" not in text)
check("no phone in what is sent", "0712345678" not in text and "712345678" not in text)
check("no user in what is sent", "user" not in (sent[0] if sent else {}))
check("error type still reported", "RuntimeError" in text)
check("request reduced to method + url without query",
      cleaned["request"] == {"method": "POST", "url": "https://api/x/diagnose"})
check("no headers, body or cookies kept", "Authorization" not in json.dumps(cleaned) and "data" not in cleaned["request"])
check("environment and no tracing", client.options["environment"] == "production-test"
      and client.options["traces_sample_rate"] == 0.0 and client.options["send_default_pii"] is False)
print(f"\n{sum(ok)}/{len(ok)} passed")
