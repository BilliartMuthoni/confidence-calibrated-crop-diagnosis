"""Scratch test: every sign-in path through the AUTHENTICATOR step (the step the SMS change broke on
10 Nov). Fake settings, SQLite, codes captured instead of sent. Run from this folder."""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "f.db")
if os.path.exists(DB):
    os.remove(DB)
os.environ.update({
    "DATABASE_URL": f"sqlite:///{DB}",
    "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
    "TOTP_ENCRYPTION_KEY": __import__("cryptography.fernet", fromlist=["Fernet"]).Fernet.generate_key().decode(),
    "APP_ENV": "development", "SMTP_HOST": "", "GROQ_API_KEY": "", "AT_USERNAME": "", "AT_API_KEY": "",
})
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")))

import pyotp  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.db.session import Base, engine  # noqa: E402
import app.models.user, app.models.diagnosis, app.models.oauth_flow, app.models.referral  # noqa
import app.models.contact, app.models.advice, app.models.audit, app.models.staff_auth, app.models.saved_turn  # noqa
import app.routers.auth as auth  # noqa: E402
import app.routers.oauth as oauth_router  # noqa: E402

limiter.enabled = False
Base.metadata.create_all(engine)
api = FastAPI()
api.include_router(auth.router)
c = TestClient(api, raise_server_exceptions=False)

SENT = []
auth.send_sms_code = lambda phone, code: SENT.append(code)
auth.send_email_code = lambda to, code: SENT.append(code)
ok = 0


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if not cond else ""))
    ok += bool(cond)
    if not cond:
        raise SystemExit(1)


def code_at(secret, offset_steps=0):
    return pyotp.TOTP(secret).at(time.time() + 30 * offset_steps)


check("_check_code is the authenticator check (takes request)",
      "request" in auth._check_code.__code__.co_varnames[:auth._check_code.__code__.co_argcount])
check("oauth router uses the same authenticator check", oauth_router._check_code is auth._check_code)
check("emailed/SMS code check has its own name", callable(auth._check_sent_code))


def full_path(kind, login, verify_route):
    body = {"accept_terms": True, "password": "longpassword1", **login}
    r = c.post("/auth/register", json=body)
    check(f"{kind}: sign-up asks for the sent code", r.status_code == 201 and r.json()["next_step"].startswith("verify_"), r.text)
    r = c.post(verify_route, json={"mfa_token": r.json()["mfa_token"], "code": SENT[-1]})
    check(f"{kind}: right sent code -> authenticator setup", r.status_code == 200 and r.json()["next_step"] == "setup", r.text)
    secret = r.json()["setup"]["secret"]
    r = c.post("/auth/mfa/setup/confirm", json={"mfa_token": r.json()["mfa_token"], "code": "000000" if code_at(secret) != "000000" else "111111"})
    check(f"{kind}: wrong authenticator code at setup -> 400, not 500", r.status_code == 400, r.text)
    r = c.post("/auth/register", json=body)  # same login again: an unconfirmed sign-up can start over
    tok = c.post("/auth/login", json={"password": "longpassword1", **login}).json()
    if tok["next_step"] != "setup":
        tok = c.post(verify_route, json={"mfa_token": tok["mfa_token"], "code": SENT[-1]}).json()
    secret = tok["setup"]["secret"]
    r = c.post("/auth/mfa/setup/confirm", json={"mfa_token": tok["mfa_token"], "code": code_at(secret)})
    check(f"{kind}: right authenticator code at setup -> signed in", r.status_code == 200 and "access_token" in r.json(), r.text)
    access = r.json()["access_token"]
    r = c.post("/auth/login", json={"password": "longpassword1", **login})
    check(f"{kind}: next sign-in asks only for the authenticator", r.json()["next_step"] == "verify", r.text)
    mfa = r.json()["mfa_token"]
    r = c.post("/auth/mfa/verify", json={"mfa_token": mfa, "code": "000000" if code_at(secret, 1) != "000000" else "111111"})
    check(f"{kind}: wrong authenticator code at sign-in -> 400, not 500", r.status_code == 400, r.text)
    r = c.post("/auth/mfa/verify", json={"mfa_token": mfa, "code": code_at(secret, 1)})
    check(f"{kind}: right authenticator code at sign-in -> signed in", r.status_code == 200 and "access_token" in r.json(), r.text)
    access = r.json()["access_token"]
    # Account screens: new backup codes need a fresh authenticator code. A code from an earlier
    # time step than the last one used is refused (replay protection), so start that marker over.
    from app.db.session import SessionLocal
    from app.models.user import User
    s = SessionLocal()
    for u in s.query(User).all():
        u.totp_last_used_step = None
    s.commit(); s.close()
    r = c.post("/auth/backup-codes", json={"code": code_at(secret)}, headers={"Authorization": f"Bearer {access}"})
    check(f"{kind}: backup codes with the authenticator code -> 200, not 500", r.status_code == 200, r.text)


full_path("phone", {"phone_number": "0712345678"}, "/auth/phone/verify")
full_path("email", {"email": "farmer@example.org"}, "/auth/email/verify")
print(f"{ok} checks passed")
