"""Scratch test: phone numbers in one form, Kenyan only; forgot password; the data migration.
Fake settings, SQLite, codes captured instead of sent. Run from this folder."""
import os
import sys
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "r.db")
MDB = os.path.join(HERE, "rm.db")
for p in (DB, MDB):
    if os.path.exists(p):
        os.remove(p)
from cryptography.fernet import Fernet  # noqa: E402
ENV = {
    "DATABASE_URL": f"sqlite:///{DB}",
    "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
    "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "APP_ENV": "development", "SMTP_HOST": "", "GROQ_API_KEY": "", "AT_USERNAME": "", "AT_API_KEY": "",
}
os.environ.update(ENV)
BACK = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, BACK)

import pyotp  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.phone import normalise_phone, local_form  # noqa: E402
from app.db.session import Base, engine, SessionLocal  # noqa: E402
import app.models.user, app.models.diagnosis, app.models.oauth_flow, app.models.referral  # noqa
import app.models.contact, app.models.advice, app.models.audit, app.models.staff_auth, app.models.saved_turn  # noqa
from app.models.user import User, UserRole  # noqa: E402
import app.routers.auth as auth  # noqa: E402

limiter.enabled = False
Base.metadata.create_all(engine)
api = FastAPI()
api.include_router(auth.router)
c = TestClient(api, raise_server_exceptions=False)
SENT = []
auth.send_sms_code = lambda phone, code: SENT.append(("sms", phone, code))
auth.send_email_code = lambda to, code: SENT.append(("email", to, code))
ok = 0


def check(name, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if not cond else ""))
    ok += bool(cond)
    if not cond:
        raise SystemExit(1)


def raises(v):
    try:
        normalise_phone(v)
        return False
    except ValueError:
        return True


# 1. One form
for typed in ["0712345678", "0712 345 678", "712345678", "254712345678", "+254712345678", "+254 712-345-678",
              "00254712345678", "(0712) 345678"]:
    check(f"'{typed}' -> +254712345678", normalise_phone(typed) == "+254712345678", normalise_phone(typed))
check("01 numbers -> +2541...", normalise_phone("0110 123 456") == "+254110123456")
for bad in ["+255712345678", "+1 202 555 0143", "0202345678", "07123", "0712345678901", "abc", "+254", "0812345678"]:
    check(f"'{bad}' refused", raises(bad))
check("shown as 07...", local_form("+254712345678") == "0712345678")


def sign_up(login, password="longpassword1"):
    r = c.post("/auth/register", json={"accept_terms": True, "password": password, **login})
    if r.json().get("next_step", "").startswith("verify_"):
        r = c.post("/auth/phone/verify" if "phone_number" in login else "/auth/email/verify",
                   json={"mfa_token": r.json()["mfa_token"], "code": SENT[-1][2]})
    secret = r.json()["setup"]["secret"]
    r = c.post("/auth/mfa/setup/confirm", json={"mfa_token": r.json()["mfa_token"], "code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200, r.text
    return secret


def reset_marker():
    s = SessionLocal()
    for u in s.query(User).all():
        u.totp_last_used_step = None
        u.email_code_sent_at = None  # no one-minute wait between test steps
    s.commit(); s.close()


def db_user(phone=None, email=None):
    s = SessionLocal()
    u = s.query(User).filter((User.user_phone_number == phone) if phone else (User.user_email == email)).first()
    s.expunge_all(); s.close()
    return u


# 2. Sign up with 07..., log in with +254...
secret = sign_up({"phone_number": "0712 345 678"})
check("stored as +254712345678", db_user("+254712345678") is not None)
r = c.post("/auth/login", json={"phone_number": "+254712345678", "password": "longpassword1"})
check("log in with +254 finds the 07 account", r.status_code == 200 and r.json()["next_step"] == "verify", r.text)
r = c.post("/auth/login", json={"phone_number": "712345678", "password": "longpassword1"})
check("log in with 712... finds it too", r.status_code == 200, r.text)
r = c.post("/auth/register", json={"accept_terms": True, "password": "longpassword1", "phone_number": "+254712345678"})
check("same number in another spelling can't sign up twice", r.status_code == 400 and "already exists" in r.text, r.text)
r = c.post("/auth/register", json={"accept_terms": True, "password": "longpassword1", "phone_number": "+255712345678"})
check("foreign number: clear message", r.status_code == 422 and "Kenyan mobile numbers" in r.text, r.text)

# 3. Forgot password, phone
SENT.clear(); reset_marker()
r = c.post("/auth/password/forgot", json={"phone_number": "0712345678"})
check("forgot: token, code sent by SMS to +254", r.status_code == 200 and SENT and SENT[-1][:2] == ("sms", "+254712345678"), r.text)
token, sent = r.json()["reset_token"], SENT[-1][2]
n = len(SENT)
r = c.post("/auth/password/forgot", json={"phone_number": "0799999999"})
check("unknown number: same answer, nothing sent", r.status_code == 200 and set(r.json()) == {"reset_token", "expires_in_minutes", "resend_in_seconds"} and len(SENT) == n, r.text)
fake = r.json()["reset_token"]
r = c.post("/auth/password/reset", json={"reset_token": fake, "code": "123456", "mfa_code": "123456", "new_password": "newpassword1"})
check("unknown number: reset says the code is not right", r.status_code == 400 and "code is not right" in r.text, r.text)
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "new_password": "newpassword1"})
check("no authenticator code: asked for it", r.status_code == 400 and "authenticator app, or a backup code" in r.text, r.text)
wrong_totp = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "mfa_code": wrong_totp, "new_password": "newpassword1"})
check("wrong authenticator code: 400", r.status_code == 400 and "Wrong or expired code" in r.text, r.text)
check("...and the sent code is still usable", db_user("+254712345678").email_code_hash is not None)
r = c.post("/auth/password/reset", json={"reset_token": token, "code": "000000" if sent != "000000" else "111111",
                                          "mfa_code": pyotp.TOTP(secret).now(), "new_password": "newpassword1"})
check("wrong sent code: tries left", r.status_code == 400 and "tries left" in r.text, r.text)
reset_marker()
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "mfa_code": pyotp.TOTP(secret).now(), "new_password": "short"})
check("new password too short: 422", r.status_code == 422, r.text)
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "mfa_code": pyotp.TOTP(secret).now(), "new_password": "newpassword1"})
check("right codes: password changed (204)", r.status_code == 204, r.text)
u = db_user("+254712345678")
check("every phone signed out, sent code used up", u.refresh_token_id is None and u.email_code_hash is None)
r = c.post("/auth/login", json={"phone_number": "0712345678", "password": "longpassword1"})
check("old password no longer works", r.status_code == 401, r.text)
r = c.post("/auth/login", json={"phone_number": "0712345678", "password": "newpassword1"})
check("new password works", r.status_code == 200, r.text)
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "mfa_code": pyotp.TOTP(secret).now(), "new_password": "another12345"})
check("the same code can't be used twice", r.status_code == 400, r.text)

# 4. Backup code instead of the authenticator; a wrong sent code must not burn it
reset_marker()
r = c.post("/auth/password/forgot", json={"phone_number": "0712345678"})
token, sent = r.json()["reset_token"], SENT[-1][2]
s = SessionLocal(); uid = s.query(User).filter(User.user_phone_number == "+254712345678").first().user_id; s.close()
from app.core.security import hash_password  # noqa: E402
from app.models.staff_auth import BackupCode  # noqa: E402
s = SessionLocal(); s.add(BackupCode(user_id=uid, code_hash=hash_password("1234-5678"))); s.commit(); s.close()
r = c.post("/auth/password/reset", json={"reset_token": token, "code": "000000" if sent != "000000" else "111111",
                                          "backup_code": "1234 5678", "new_password": "backup-reset-1"})
s = SessionLocal(); unused = s.query(BackupCode).filter(BackupCode.user_id == uid, BackupCode.used_at.is_(None)).count(); s.close()
check("wrong sent code: backup code NOT used up", r.status_code == 400 and unused == 1, r.text)
r = c.post("/auth/password/reset", json={"reset_token": token, "code": sent, "backup_code": "1234 5678", "new_password": "backup-reset-1"})
s = SessionLocal(); unused = s.query(BackupCode).filter(BackupCode.user_id == uid, BackupCode.used_at.is_(None)).count(); s.close()
check("sent code + backup code: changed, backup code used once", r.status_code == 204 and unused == 0, r.text)

# 5. Email; staff and Google-only get nothing; production without SMS
secret2 = sign_up({"email": "farmer@example.org"})
SENT.clear(); reset_marker()
r = c.post("/auth/password/forgot", json={"email": "farmer@example.org"})
check("email: code sent by email", r.status_code == 200 and SENT and SENT[-1][0] == "email", r.text)
s = SessionLocal()
s.add(User(user_email="officer@example.org", role=UserRole.officer, hashed_password=hash_password("staffpassword12"), mfa_enabled=True))
s.add(User(user_email="google@example.org", google_id="g-1", role=UserRole.farmer, mfa_enabled=True))
s.commit(); s.close()
n = len(SENT)
for who in ("officer@example.org", "google@example.org"):
    r = c.post("/auth/password/forgot", json={"email": who})
    check(f"{who.split('@')[0]}: same answer, no code sent", r.status_code == 200 and len(SENT) == n, r.text)
settings.app_env = "production"
r = c.post("/auth/password/forgot", json={"phone_number": "0712345678"})
check("server without live SMS: phone reset says so (503)", r.status_code == 503 and "SMS" in r.text, r.text)
r = c.post("/auth/password/forgot", json={"email": "farmer@example.org"})
check("...email reset still works", r.status_code == 200, r.text)
settings.app_env = "development"

# 6. The migration converts stored numbers, leaves clashes and foreign ones alone
env = dict(os.environ, PYTHONPATH=BACK, DATABASE_URL=f"sqlite:///{MDB}")
alembic = [sys.executable, "-m", "alembic", "-c", os.path.join(BACK, "alembic.ini")]
r = subprocess.run(alembic + ["upgrade", "e3f4a5b6c7d8"], cwd=HERE, env=env, capture_output=True, text=True)
check("migrate to the revision before", r.returncode == 0, r.stderr[-400:])
import sqlite3  # noqa: E402
con = sqlite3.connect(MDB)
for i, phone in enumerate(["0711 111 111", "+254722222222", "254733333333", "0744444444", "+254744444444", "+255755555555"], 1):
    con.execute("INSERT INTO users (user_id, user_phone_number, role, mfa_enabled, is_verified, failed_attempts) VALUES (?,?,'farmer',1,1,0)", (i, phone))
con.commit()
r = subprocess.run(alembic + ["upgrade", "head"], cwd=HERE, env=env, capture_output=True, text=True)
check("upgrade head", r.returncode == 0, r.stderr[-400:])
got = dict(con.execute("SELECT user_id, user_phone_number FROM users").fetchall())
check("07 with spaces converted", got[1] == "+254711111111", got)
check("already +254 kept", got[2] == "+254722222222", got)
check("254... converted", got[3] == "+254733333333", got)
check("same number twice: both left as they were", got[4] == "0744444444" and got[5] == "+254744444444", got)
check("foreign number left", got[6] == "+255755555555", got)
check("clash and foreign number listed in the log", "same phone number" in r.stderr and "not a Kenyan" in r.stderr, r.stderr[-600:])
r = subprocess.run(alembic + ["downgrade", "e3f4a5b6c7d8"], cwd=HERE, env=env, capture_output=True, text=True)
check("downgrade runs", r.returncode == 0, r.stderr[-300:])
con.close()
print(f"{ok} checks passed")
