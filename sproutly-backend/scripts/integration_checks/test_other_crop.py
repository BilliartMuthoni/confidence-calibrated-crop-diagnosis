"""Scratch test (SQLite WITH foreign keys enforced, like PostgreSQL): "None of these crops" on a
shared photo that already has a referral."""
import os
import subprocess
import sys
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "oc.db")
if os.path.exists(DB):
    os.remove(DB)
from cryptography.fernet import Fernet  # noqa: E402

UP = os.path.join(HERE, "uploads_oc")
os.makedirs(UP, exist_ok=True)
os.environ.update({"DATABASE_URL": f"sqlite:///{DB}", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "development",
                   "SMTP_HOST": "", "GROQ_API_KEY": "", "TEXT_MODEL_PATH": "", "UPLOAD_DIR": UP})
BACK = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, BACK)
env = dict(os.environ, PYTHONPATH=BACK)
ok = []


def check(name, cond):
    ok.append(bool(cond))
    print("PASS" if cond else "FAIL", name)


r = subprocess.run([sys.executable, "-m", "alembic", "-c", os.path.join(BACK, "alembic.ini"), "upgrade", "head"],
                   cwd=HERE, env=env, capture_output=True, text=True)
check("upgrade head", r.returncode == 0)

from sqlalchemy import event  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402


@event.listens_for(engine, "connect")
def _fk_on(conn, _):
    conn.execute("PRAGMA foreign_keys=ON")


engine.dispose()
from app.models import advice as _a, audit, contact, diagnosis as _d, oauth_flow, referral as _r, staff_auth  # noqa: E402,F401
from app.models.diagnosis import CropType, Diagnosis  # noqa: E402
from app.models.referral import Referral, ReferralStatus  # noqa: E402
from app.models.saved_turn import SavedTurn  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.routers import diagnosis as dr  # noqa: E402

db = SessionLocal()
fk = db.execute(__import__("sqlalchemy").text("PRAGMA foreign_keys")).scalar()
check("foreign keys enforced", fk == 1)
farmer = User(user_email="f@x.org", role=UserRole.farmer, mfa_enabled=True, is_verified=True, failed_attempts=0)
db.add(farmer)
db.commit()
photo = os.path.join(UP, "p.jpg")
open(photo, "wb").write(b"x")
d = Diagnosis(user_id=farmer.user_id, image_path=photo, crop=CropType.maize, confidence=0.5, is_referred=True,
              share_with_officer=True, top_class="Corn_(maize)___healthy")
db.add(d)
db.commit()
db.add(Referral(diagnosis_id=d.diagnosis_id, county="Nakuru", status=ReferralStatus.new,
                expires_at=datetime.utcnow() + timedelta(days=7)))
db.add(SavedTurn(diagnosis_id=d.diagnosis_id, user_id=farmer.user_id, question="q", reply={}, asked_at=datetime.utcnow()))
db.commit()
fn = getattr(dr.other_crop, "__wrapped__", dr.other_crop)
try:
    fn(None, d.diagnosis_id, db, farmer)
    worked = True
except Exception as e:  # noqa: BLE001
    print("error:", type(e).__name__, str(e)[:200])
    worked = False
check("removed without error", worked)
db.expire_all()
check("check gone", db.query(Diagnosis).count() == 0)
check("referral gone", db.query(Referral).count() == 0)
check("photo file gone after commit", not os.path.exists(photo))
print(f"{sum(ok)}/{len(ok)} passed")
