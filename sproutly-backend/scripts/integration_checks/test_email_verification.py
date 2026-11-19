"""Scratch test for email verification (t08). Fake settings, SQLite, fake SMTP. Run from this folder."""
import os
import sys
import threading
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "t.db")
if os.path.exists(DB):
    os.remove(DB)

os.environ.update({
    "DATABASE_URL": f"sqlite:///{DB}",
    "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
    "TOTP_ENCRYPTION_KEY": __import__("cryptography.fernet", fromlist=["Fernet"]).Fernet.generate_key().decode(),
    "APP_ENV": "development",
    "SMTP_HOST": "127.0.0.1",
    "SMTP_PORT": "2525",
    "SMTP_USERNAME": "",
    "MAIL_FROM": "support@example.org",
    "GROQ_API_KEY": "",
})
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")))

# --- fake SMTP server that accepts STARTTLS-less mail is awkward; patch starttls/login instead ---
import smtplib  # noqa: E402

SENT = []


class FakeSMTP:
    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self, context=None):
        SENT.append(("starttls", self.host, self.port))

    def login(self, u, p):
        SENT.append(("login", u))

    def send_message(self, msg):
        text = msg.get_body(preferencelist=("plain",)).get_content()
        html = msg.get_body(preferencelist=("html",)).get_content()
        assert msg["Subject"].split()[0] in text and msg["Subject"].split()[0] in html and html.count("href") == 1 and "/privacy" in html
        SENT.append(("msg", msg["To"], msg["Subject"], text))


smtplib.SMTP = FakeSMTP

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

from app.core.limiter import limiter  # noqa: E402
from app.db.session import Base, engine, SessionLocal  # noqa: E402
import app.models.user, app.models.diagnosis, app.models.oauth_flow, app.models.referral  # noqa
import app.models.contact, app.models.advice, app.models.audit, app.models.staff_auth, app.models.saved_turn  # noqa
from app.models.user import User, UserRole  # noqa: E402
from app.routers.auth import router  # noqa: E402
from app.core.timeutil import utcnow  # noqa: E402
from app.core.security import hash_password  # noqa: E402

limiter.enabled = False
Base.metadata.create_all(engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(router)
c = TestClient(api)

ok = 0


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if not cond else ""))
    ok += bool(cond)
    if not cond:
        raise SystemExit(1)


def last_code():
    body = [m for m in SENT if m[0] == "msg"][-1][3]
    return body.split("code is ")[1].split()[0]


def db_user(email):
    s = SessionLocal()
    u = s.query(User).filter(User.user_email == email).first()
    s.expunge_all(); s.close()
    return u


def age_send(email, seconds):
    s = SessionLocal()
    u = s.query(User).filter(User.user_email == email).first()
    u.email_code_sent_at = u.email_code_sent_at - timedelta(seconds=seconds)
    s.commit(); s.close()


# 1. Email sign-up -> code emailed, verify_email step, code not stored in plain
r = c.post("/auth/register", json={"accept_terms": True, "email": "jane@example.org", "password": "longpassword1"})
check("sign-up answers verify_email", r.status_code == 201 and r.json()["next_step"] == "verify_email", r.text)
tok = r.json()["mfa_token"]
check("one email sent, via STARTTLS", sum(1 for m in SENT if m[0] == "msg") == 1 and SENT[0][0] == "starttls")
code = last_code()
u = db_user("jane@example.org")
check("code stored only as hash", u.email_code_hash and code not in u.email_code_hash and len(u.email_code_hash) == 64)
check("resend_in_seconds about 60", 55 <= r.json()["resend_in_seconds"] <= 60, r.json())

# 2. Setup token can't be skipped: mfa setup confirm with the email token fails
r = c.post("/auth/mfa/setup/confirm", json={"mfa_token": tok, "code": "123456"})
check("email token is not a setup token", r.status_code == 400)

# 3. Wrong codes: 5 tries then dead
wrong = "000000" if code != "000000" else "111111"
for i in range(4):
    r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": wrong})
check("4th wrong says 1 try left", r.status_code == 400 and "1 try left" in r.json()["detail"], r.text)
r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": wrong})
check("5th wrong ends the code", "Too many wrong codes" in r.json()["detail"], r.text)
r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": code})
check("right code refused after 5 wrong", r.status_code == 400, r.text)

# 4. Resend too soon -> 429; after 60 s -> new code
r = c.post("/auth/email/resend", json={"mfa_token": tok})
check("resend within 60 s refused", r.status_code == 429, r.text)
age_send("jane@example.org", 61)
r = c.post("/auth/email/resend", json={"mfa_token": tok})
check("resend after 60 s works", r.status_code == 200 and r.json()["next_step"] == "verify_email", r.text)
code2 = last_code()
tok = r.json()["mfa_token"]
check("still exactly 2 emails", sum(1 for m in SENT if m[0] == "msg") == 2)

# 5. Expired code
s = SessionLocal(); x = s.query(User).filter(User.user_email == "jane@example.org").first()
real_exp = x.email_code_expires; x.email_code_expires = utcnow() - timedelta(seconds=1); s.commit(); s.close()
r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": code2})
check("expired code refused", r.status_code == 400 and "expired" in r.json()["detail"], r.text)
s = SessionLocal(); x = s.query(User).filter(User.user_email == "jane@example.org").first()
x.email_code_expires = real_exp; s.commit(); s.close()

# 6. Right code -> authenticator setup
r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": code2.replace("", "")})
check("right code -> setup step", r.status_code == 200 and r.json()["next_step"] == "setup", r.text)
check("email_verified_at set", db_user("jane@example.org").email_verified_at is not None)

# 7. Login with wrong password sends nothing
n = len(SENT)
s = SessionLocal()
s.add(User(user_email="ann@example.org", hashed_password=hash_password("longpassword1"), role=UserRole.farmer,
           mfa_enabled=True, totp_secret_encrypted="x", is_verified=True))
s.commit(); s.close()
r = c.post("/auth/login", json={"email": "ann@example.org", "password": "wrongpassword"})
check("wrong password -> 401, no email", r.status_code == 401 and len(SENT) == n, r.text)
r = c.post("/auth/login", json={"email": "nobody@example.org", "password": "wrongpassword"})
check("unknown email -> 401, no email", r.status_code == 401 and len(SENT) == n, r.text)

# 8. Existing (pre-feature) email farmer with MFA on: right password -> verify_email, then the code step
r = c.post("/auth/login", json={"email": "ann@example.org", "password": "longpassword1"})
check("old email account asked to confirm", r.json()["next_step"] == "verify_email", r.text)
tok = r.json()["mfa_token"]
# signing in again within the minute does not send a second email
m_before = sum(1 for m in SENT if m[0] == "msg")
r2 = c.post("/auth/login", json={"email": "ann@example.org", "password": "longpassword1"})
check("second sign-in within 60 s sends no new email",
      sum(1 for m in SENT if m[0] == "msg") == m_before and r2.json()["next_step"] == "verify_email")
r = c.post("/auth/email/verify", json={"mfa_token": tok, "code": last_code()})
check("then the authenticator code step", r.status_code == 200 and r.json()["next_step"] == "verify", r.text)

# 9. Old account is NEVER replaced by a new sign-up (MFA on)
r = c.post("/auth/register", json={"accept_terms": True, "email": "ann@example.org", "password": "anotherpass1"})
check("used account not replaced", r.status_code == 400, r.text)

# 10. Unused sign-up is replaced; daily cap carries over
r = c.post("/auth/register", json={"accept_terms": True, "email": "typo@example.org", "password": "firstpass12"})
check("first unfinished sign-up", r.json()["next_step"] == "verify_email")
age_send("typo@example.org", 61)
r = c.post("/auth/register", json={"accept_terms": True, "email": "typo@example.org", "password": "secondpass12"})
check("unfinished sign-up taken over", r.status_code == 201 and r.json()["next_step"] == "verify_email", r.text)
from app.core.security import verify_password  # noqa: E402
uu = db_user("typo@example.org")
check("new password applies", verify_password("secondpass12", uu.hashed_password) and uu.email_codes_today == 2)

# 11. Unused sign-up with a check saved is NOT replaced
from app.models.diagnosis import Diagnosis  # noqa: E402
cols = {col.name for col in Diagnosis.__table__.columns if not col.nullable and col.default is None and not col.primary_key}
print("   (Diagnosis required columns:", sorted(cols), ")")

# 12. Daily cap
tok = r.json()["mfa_token"]
for i in range(8):
    age_send("typo@example.org", 61)
    r = c.post("/auth/email/resend", json={"mfa_token": tok})
check("10th code of the day still sent", r.status_code == 200, r.text)
age_send("typo@example.org", 61)
r = c.post("/auth/email/resend", json={"mfa_token": tok})
check("11th code refused (daily cap)", r.status_code == 429 and "tomorrow" in r.json()["detail"], r.text)
age_send("typo@example.org", 61)
r = c.post("/auth/register", json={"accept_terms": True, "email": "typo@example.org", "password": "thirdpass123"})
check("re-sign-up can't dodge the cap", r.status_code == 429, r.text)

# 13. Phone sign-up unchanged; both refused
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0712345678", "password": "longpassword1"})
check("phone sign-up asks for the SMS code on a laptop (t22)", r.status_code == 201 and r.json()["next_step"] == "verify_phone", r.text)
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0712345679", "email": "both@example.org", "password": "longpassword1"})
check("phone + email together refused", r.status_code == 400, r.text)

# 14. Staff with email: no email step
s = SessionLocal()
s.add(User(user_email="officer@example.org", hashed_password=hash_password("verylongpassword1"),
           role=UserRole.officer, mfa_enabled=True, totp_secret_encrypted="x", is_verified=True))
s.commit(); s.close()
r = c.post("/auth/login", json={"email": "officer@example.org", "password": "verylongpassword1"})
check("staff sign-in unchanged", r.json()["next_step"] == "verify", r.text)

# 15. Production without SMTP refuses (503) rather than silently skipping
from app.core.config import settings  # noqa: E402
settings.smtp_host = ""; settings.app_env = "production"
r = c.post("/auth/register", json={"accept_terms": True, "email": "prod@example.org", "password": "longpassword1"})
check("production without SMTP -> 503", r.status_code == 503, r.text)
settings.app_env = "development"
age_send("prod@example.org", 61)
r = c.post("/auth/login", json={"email": "prod@example.org", "password": "longpassword1"})
check("laptop without SMTP prints the code instead", r.status_code == 200 and r.json()["next_step"] == "verify_email", r.text)

# 16. Terms (t50)
r = c.post("/auth/register", json={"phone_number": "0799000111", "password": "longpassword1"})
check("sign-up without the tick refused", r.status_code == 400 and "Terms" in r.json()["detail"], r.text)
u = db_user("jane@example.org") or None
s = SessionLocal(); ph = s.query(User).filter(User.user_phone_number == "+254712345678").first()
check("sign-up records the terms version", ph.terms_version == "2026-11-06" and ph.terms_accepted_at is not None)
ph.mfa_enabled = True; ph.totp_secret_encrypted = "x"; ph.terms_version = None; s.commit(); uid = ph.user_id; s.close()
from app.core.security import create_access_token  # noqa: E402
hdr = {"Authorization": "Bearer " + create_access_token(subject=str(uid), role="farmer")}
r = c.get("/auth/me", headers=hdr)
check("old account: terms_current false", r.status_code == 200 and r.json()["terms_current"] is False, r.text)
r = c.post("/auth/me/terms", headers=hdr)
check("I agree -> terms_current true", r.status_code == 200 and r.json()["terms_current"] is True and r.json()["terms_version"] == "2026-11-06", r.text)
settings.terms_version = "2027-01-01"
check("terms changed -> asked again", c.get("/auth/me", headers=hdr).json()["terms_current"] is False)
settings.terms_version = "2026-11-06"

print(f"\nALL {ok} CHECKS PASSED")

