"""System tests T32 and T36 on a local copy of the backend (fake settings, SQLite; cwd = this folder).

T32: a referral left unanswered past its expiry date is closed as expired, and the check reports
it, so the app shows "No officer replied in time" with the support contacts.
T36: with a wrong language-model key, a question gets the fixed "assistant isn't available"
reply, pointing to the advice and the officer, and no advice is invented.
"""
import os
import subprocess
import sys
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "t32.db")
if os.path.exists(DB):
    os.remove(DB)
from cryptography.fernet import Fernet  # noqa: E402

os.environ.update({"DATABASE_URL": f"sqlite:///{DB}", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "development",
                   "SMTP_HOST": "", "GROQ_API_KEY": "gsk_wrong_key_for_test_t36"})
BACK = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, BACK)
env = dict(os.environ, PYTHONPATH=BACK)
ok = []


def check(name, cond):
    ok.append(bool(cond))
    print("PASS" if cond else "FAIL", name)


r = subprocess.run([sys.executable, "-m", "alembic", "-c", os.path.join(BACK, "alembic.ini"), "upgrade", "head"],
                   cwd=HERE, env=env, capture_output=True, text=True)
check("database created", r.returncode == 0)

from app.db.session import SessionLocal  # noqa: E402
from app.models import advice as _a, audit, contact, diagnosis as _d, oauth_flow, referral as _r, staff_auth  # noqa: E402,F401
from app.models.user import User, UserRole  # noqa: E402
from app.models.diagnosis import Diagnosis, CropType  # noqa: E402
from app.models.referral import Referral, ReferralStatus  # noqa: E402
from app.core import assistant  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.referrals import open_referral  # noqa: E402
from app.core.timeutil import utcnow  # noqa: E402
from app.routers import diagnosis as dr  # noqa: E402
from app.schemas.diagnosis import AssistantQuestion  # noqa: E402

PHOTO = os.path.join(HERE, "leaf32.jpg")
open(PHOTO, "wb").write(b"x")
db = SessionLocal()
farmer = User(user_email="f@example.org", role=UserRole.farmer, mfa_enabled=True, is_verified=True,
              failed_attempts=0, keep_questions=False, county="Nakuru")
db.add(farmer)
db.commit()

# T32: a shared check that was not diagnosed, left unanswered past its expiry.
check_ref = Diagnosis(user_id=farmer.user_id, image_path=PHOTO, crop=CropType.maize, confidence=0.5,
                      is_referred=True, top_class="Corn_(maize)___Common_rust_", predicted_disease=None,
                      share_with_officer=True)
db.add(check_ref)
db.commit()
referral = open_referral(db, check_ref, farmer)
db.commit()
check("referral opened as new", referral.status == ReferralStatus.new)
referral.expires_at = utcnow() - timedelta(minutes=1)  # as if REFERRAL_DAYS had passed
db.commit()
detail = getattr(dr.get_diagnosis, "__wrapped__", dr.get_diagnosis)(check_ref.diagnosis_id, db, farmer)
db.refresh(referral)
check("T32: unanswered referral is closed as expired", referral.status == ReferralStatus.expired)
check("T32: the check reports it as expired to the app", detail.referral_status == "expired")

# T36: wrong language-model key on a diagnosed check.
settings.assistant_provider = "groq"
diag = Diagnosis(user_id=farmer.user_id, image_path=PHOTO, crop=CropType.potato, confidence=0.99,
                 is_referred=False, top_class="Potato___Late_blight", predicted_disease="Potato Late Blight")
db.add(diag)
db.commit()
reply = getattr(dr.ask_assistant, "__wrapped__", dr.ask_assistant)(
    None, diag.diagnosis_id, AssistantQuestion(question="How do I stop it spreading?"), db, farmer)
check("T36: the reply is the fixed 'unavailable' message", reply.kind == "unavailable"
      and reply.message == assistant.UNAVAILABLE)
check("T36: no advice entries are given", not reply.advice)
print("    message:", reply.message)
db.close()
print(f"\n{sum(ok)}/{len(ok)} passed")
