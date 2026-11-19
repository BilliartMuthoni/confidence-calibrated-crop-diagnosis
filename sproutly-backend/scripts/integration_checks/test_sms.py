"""Scratch test for SMS phone confirmation (t22). Fake settings, SQLite, fake Africa's Talking. Run from this folder."""
import os
import sys
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "s.db")
if os.path.exists(DB):
    os.remove(DB)
os.environ.update({
    "DATABASE_URL": f"sqlite:///{DB}",
    "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
    "TOTP_ENCRYPTION_KEY": __import__("cryptography.fernet", fromlist=["Fernet"]).Fernet.generate_key().decode(),
    "APP_ENV": "development", "SMTP_HOST": "", "GROQ_API_KEY": "", "AT_USERNAME": "", "AT_API_KEY": "",
})
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core import sms  # noqa: E402
from app.core.phone import normalise_phone  # noqa: E402
from app.db.session import Base, engine, SessionLocal  # noqa: E402
import app.models.user, app.models.diagnosis, app.models.oauth_flow, app.models.referral  # noqa
import app.models.contact, app.models.advice, app.models.audit, app.models.staff_auth, app.models.saved_turn  # noqa
from app.models.user import User  # noqa: E402
from app.routers.auth import router  # noqa: E402

limiter.enabled = False
Base.metadata.create_all(engine)
api = FastAPI()
api.include_router(router)
c = TestClient(api)

LOGGED, POSTS = [], []
sms.log.warning = lambda fmt, phone, code: LOGGED.append((phone, code))
REPLY = {"status": "Success"}


class FakeResponse:
    def __init__(self, status):
        self.status_code = 201 if status == "Success" else 400
        self.content = b"x"
        self._status = status

    def json(self):
        return {"SMSMessageData": {"Message": "Sent to 1/1", "Recipients": [{"status": self._status, "number": "x"}]}}


def fake_post(url, data, timeout, headers):
    POSTS.append((url, data, headers))
    return FakeResponse(REPLY["status"])


sms.httpx.post = fake_post
ok = 0


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if not cond else ""))
    ok += bool(cond)
    if not cond:
        raise SystemExit(1)


def user(phone):
    s = SessionLocal()
    u = s.query(User).filter(User.user_phone_number == normalise_phone(phone)).first()
    s.expunge_all(); s.close()
    return u


def age(phone, seconds):
    s = SessionLocal()
    u = s.query(User).filter(User.user_phone_number == normalise_phone(phone)).first()
    u.email_code_sent_at -= timedelta(seconds=seconds)
    s.commit(); s.close()


check("+254 from 0712...", sms.to_e164("0712 345 678") == "+254712345678")
check("+254 from 254...", sms.to_e164("254712345678") == "+254712345678")
check("+254 from 712...", sms.to_e164("712345678") == "+254712345678")
check("+ kept", sms.to_e164("+255 712 345 678") == "+255712345678")

# 1. Laptop, no Africa's Talking settings: code goes to the log
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0712345678", "password": "longpassword1"})
check("phone sign-up asks for the SMS code", r.status_code == 201 and r.json()["next_step"] == "verify_phone", r.text)
check("the screen gets the phone, not an email", r.json()["phone"] == "0712345678" and r.json()["email"] is None)
token = r.json()["mfa_token"]
check("laptop: code written to the log, nothing posted", len(LOGGED) == 1 and not POSTS)
code = LOGGED[-1][1]
check("code is not stored in plain", user("0712345678").email_code_hash not in (None, code))
r = c.post("/auth/phone/verify", json={"mfa_token": token, "code": "000000" if code != "000000" else "111111"})
check("wrong code: tries left", r.status_code == 400 and "4 tries left" in r.text, r.text)
r = c.post("/auth/email/verify", json={"mfa_token": token, "code": code})
check("phone token refused at the email route", r.status_code == 400, r.text)
r = c.post("/auth/phone/verify", json={"mfa_token": token, "code": code})
check("right code: on to the authenticator set-up", r.status_code == 200 and r.json()["next_step"] == "setup", r.text)
check("phone marked confirmed", user("0712345678").phone_verified_at is not None)

# 2. Sign-in: wrong password sends nothing; right one asks for a code only if unconfirmed
c.post("/auth/register", json={"accept_terms": True, "phone_number": "0722000111", "password": "longpassword1"})
n = len(LOGGED)
r = c.post("/auth/login", json={"phone_number": "0722000111", "password": "wrongpassword"})
check("wrong password: no SMS", r.status_code == 401 and len(LOGGED) == n, r.text)
age("0722000111", 120)
r = c.post("/auth/login", json={"phone_number": "0722000111", "password": "longpassword1"})
check("right password, unconfirmed: verify_phone", r.json()["next_step"] == "verify_phone", r.text)
r = c.post("/auth/login", json={"phone_number": "0712345678", "password": "longpassword1"})
check("confirmed phone: no code asked again", r.json()["next_step"] == "setup", r.text)
r = c.post("/auth/phone/resend", json={"mfa_token": c.post("/auth/login", json={"phone_number": "0722000111", "password": "longpassword1"}).json()["mfa_token"]})
check("resend within a minute: wait", r.status_code == 429, r.text)

# 3. Sandbox and live go to the right Africa's Talking address
settings.at_username, settings.at_api_key = "sandbox", "fake-key"
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0733000222", "password": "longpassword1"})
url, data, headers = POSTS[-1]
check("sandbox address", url == sms.SANDBOX_URL and data["username"] == "sandbox" and headers["apiKey"] == "fake-key")
check("number in +254 form, message has the code", data["to"] == "+254733000222" and data["message"].split()[0].isdigit())
settings.at_username = "sproutly"
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0744000333", "password": "longpassword1"})
check("live address", POSTS[-1][0] == sms.LIVE_URL and POSTS[-1][1]["username"] == "sproutly")
REPLY["status"] = "InsufficientBalance"
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0755000444", "password": "longpassword1"})
check("Africa's Talking refuses (no credit): 503, clear message", r.status_code == 503 and "SMS" in r.text, r.text)
REPLY["status"] = "Success"

# 4. The deployed server never locks phone farmers out
settings.app_env = "production"
settings.at_username, settings.at_api_key = "", ""
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0766000555", "password": "longpassword1"})
check("server without SMS settings: straight to set-up, as today", r.json()["next_step"] == "setup", r.text)
settings.at_username, settings.at_api_key = "sandbox", "fake-key"
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0777000666", "password": "longpassword1"})
check("server with only the sandbox: straight to set-up (codes would never arrive)", r.json()["next_step"] == "setup", r.text)
settings.at_username = "sproutly"
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0788000777", "password": "longpassword1"})
check("server with a live account: SMS code asked", r.json()["next_step"] == "verify_phone", r.text)
settings.app_env = "development"

# 5. An abandoned phone sign-up can be taken over; a confirmed one cannot
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0722000111", "password": "anotherpass1"})
check("unconfirmed, unused phone sign-up: taken over", r.status_code == 201, r.text)
r = c.post("/auth/register", json={"accept_terms": True, "phone_number": "0712345678", "password": "anotherpass1"})
check("confirmed phone: 'already exists'", r.status_code == 400 and "already exists" in r.text, r.text)

print(f"\nALL {ok} CHECKS PASSED")
