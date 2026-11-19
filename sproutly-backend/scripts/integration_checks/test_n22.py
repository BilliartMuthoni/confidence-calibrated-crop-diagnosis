"""n22/n02 backend scratch test (fake env, SQLite, cwd = this folder): About this disease on the
result, retake linking in Your checks, None of these crops. The image model is stubbed."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "n22.db")
if os.path.exists(DB):
    os.remove(DB)
UPLOADS = os.path.join(HERE, "uploads_n22")
os.makedirs(UPLOADS, exist_ok=True)
from cryptography.fernet import Fernet  # noqa: E402

os.environ.update({"DATABASE_URL": f"sqlite:///{DB}", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "development",
                   "SMTP_HOST": "", "GROQ_API_KEY": "", "UPLOAD_DIR": UPLOADS, "TEXT_MODEL_PATH": "", "LEAF_CHECK_PATH": "", "BLUR_CUT_OFF": "0"})
BACK = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, BACK)
env = dict(os.environ, PYTHONPATH=BACK)
alembic = [sys.executable, "-m", "alembic", "-c", os.path.join(BACK, "alembic.ini")]
ok = []


def check(name, cond, extra=""):
    ok.append(bool(cond))
    print("PASS" if cond else "FAIL", name, "" if cond else extra)


r = subprocess.run(alembic + ["upgrade", "head"], cwd=HERE, env=env, capture_output=True, text=True)
check("upgrade head", r.returncode == 0, r.stderr[-400:])
r = subprocess.run(alembic + ["current"], cwd=HERE, env=env, capture_output=True, text=True)
check("head is a6b7c8d9e0f1", "a6b7c8d9e0f1" in r.stdout, r.stdout)

from fastapi import HTTPException  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import advice as _a, audit, contact, diagnosis as _d, oauth_flow, referral as _r, staff_auth, saved_turn  # noqa: E402,F401
from app.models.advice import AdviceEntry, AdviceKind, AdviceStatus, AdviceVersion  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.models.diagnosis import Diagnosis, CropType  # noqa: E402
from app.models.referral import Referral, ReferralStatus  # noqa: E402
from app.core.classifier import Prediction  # noqa: E402
from app.core.knowledge_base import get_guidance  # noqa: E402
from app.routers import diagnosis as dr  # noqa: E402

db = SessionLocal()
farmer = User(user_email="f@x.org", role=UserRole.farmer, mfa_enabled=True, is_verified=True, failed_attempts=0, county="Nakuru")
other = User(user_email="g@x.org", role=UserRole.farmer, mfa_enabled=True, is_verified=True, failed_attempts=0)
db.add_all([farmer, other])
db.commit()

# --- 1. About this disease ---
for kind, text in [(AdviceKind.treatment, "Remove affected leaves."), (AdviceKind.prevention, "Rotate crops."),
                   (AdviceKind.about, "It spreads in cool, wet weather."), (AdviceKind.harvest, "Store tubers dry.")]:
    e = AdviceEntry(disease="Potato___Late_blight", kind=kind, text=text, source_title="Plantwise",
                    source_url="https://example.org/" + kind.value, licence="CC BY-SA 4.0", version=1, status=AdviceStatus.active)
    db.add(e)
    db.flush()
    db.add(AdviceVersion(advice_id=e.advice_id, version=1, text=text, note="Imported"))
db.commit()
g = get_guidance("Potato___Late_blight", db)
check("result advice has about", g["about"] == ["It spreads in cool, wet weather."], g.get("about"))
check("harvest stays assistant-only", "Store tubers dry." not in sum([g[k] for k in ("treatment", "prevention", "about")], []))
check("about's source listed", any("/about" in s for s in g["sources"]) and not any("/harvest" in s for s in g["sources"]))
check("about recorded as shown (t42)", len(g["shown"]) == 3)
again = get_guidance("Potato___Late_blight", db, shown=g["shown"])
check("past check rebuilt with about", again["about"] == ["It spreads in cool, wet weather."] and not again["updated_since"])
old = get_guidance("Potato___Late_blight", db, shown=g["shown"][:2])
check("check from before: no about, not 'updated'", old["about"] == [] and not old["updated_since"])

# --- 2. Retake linking ---
create = getattr(dr.create_diagnosis, "__wrapped__", dr.create_diagnosis)
history = dr.list_diagnoses
other_crop = getattr(dr.other_crop, "__wrapped__", dr.other_crop)


def photo(name):
    path = os.path.join(UPLOADS, name)
    with open(path, "wb") as f:
        f.write(b"x")
    return path


NEXT = {}
dr.save_clean_image = lambda image: photo(image)
dr._require_checks = lambda path, allow_blurry=False: None
dr.predict = lambda crop, path, text=None: NEXT["p"]
REFERRED = Prediction("Potato___Late_blight", 0.6, CropType.potato, False, 0.9, True)
SURE = Prediction("Potato___Late_blight", 0.99, CropType.potato, False, 0.95, False)


def new(name, pred, retake_of=None, share=False):
    NEXT["p"] = pred
    return create(None, crop=CropType.potato, symptoms_text=None, image=name, share_with_officer=share,
                  allow_contact=False, county=None, affected=None, allow_blurry=False, client_id=None,
                  retake_of=retake_of, db=db, current_user=farmer)


def code(fn):
    try:
        fn()
        return 200
    except HTTPException as e:
        return e.status_code


a = new("a.jpg", REFERRED)
ids = lambda: [d.diagnosis_id for d in history(db=db, current_user=farmer)]  # noqa: E731
check("not-diagnosed check listed", a.diagnosis_id in ids())
b = new("b.jpg", SURE, retake_of=a.diagnosis_id)
check("retake made a new check", b.diagnosis_id != a.diagnosis_id)
check("Your checks: old one hidden, new one shown", a.diagnosis_id not in ids() and b.diagnosis_id in ids(), ids())
check("old check still opens directly", dr.get_diagnosis(a.diagnosis_id, db, farmer).diagnosis_id == a.diagnosis_id)
c = new("c.jpg", REFERRED, share=True)
check("shared check has a referral", db.query(Referral).filter(Referral.diagnosis_id == c.diagnosis_id).first() is not None)
d = new("d.jpg", SURE, retake_of=c.diagnosis_id)
check("retaken but sent to an officer: both stay", c.diagnosis_id in ids() and d.diagnosis_id in ids())
check("retake of a diagnosed check -> 400", code(lambda: new("e.jpg", SURE, retake_of=b.diagnosis_id)) == 400)
o = Diagnosis(user_id=other.user_id, image_path=photo("o.jpg"), crop=CropType.potato, confidence=0.5, is_referred=True)
db.add(o); db.commit()
check("retake of someone else's check -> 404", code(lambda: new("f.jpg", SURE, retake_of=o.diagnosis_id)) == 404)

# --- 3. None of these crops ---
w = new("w.jpg", REFERRED)
wpath = db.get(Diagnosis, w.diagnosis_id).image_path
gone = lambda i: db.get(Diagnosis, i) is None  # noqa: E731
code(lambda: other_crop(None, w.diagnosis_id, db=db, current_user=farmer))
db.expire_all()
check("other crop: check removed", gone(w.diagnosis_id) and w.diagnosis_id not in ids())
check("other crop: photo file deleted", not os.path.exists(wpath))
s = new("s.jpg", REFERRED, share=True)
code(lambda: other_crop(None, s.diagnosis_id, db=db, current_user=farmer))
db.expire_all()
check("shared but not picked up: removed with its referral", gone(s.diagnosis_id)
      and db.query(Referral).filter(Referral.diagnosis_id == s.diagnosis_id).first() is None)
t = new("t.jpg", REFERRED, share=True)
ref = db.query(Referral).filter(Referral.diagnosis_id == t.diagnosis_id).first()
ref.status = ReferralStatus.in_review; db.commit()
check("officer already on it -> 409, kept", code(lambda: other_crop(None, t.diagnosis_id, db=db, current_user=farmer)) == 409
      and not gone(t.diagnosis_id))
check("someone else's check -> 404", code(lambda: other_crop(None, o.diagnosis_id, db=db, current_user=farmer)) == 404)
x = new("x.jpg", REFERRED)
y = new("y.jpg", SURE, retake_of=x.diagnosis_id)
code(lambda: other_crop(None, x.diagnosis_id, db=db, current_user=farmer))
db.expire_all()
check("removing a retaken check unlinks the new one", gone(x.diagnosis_id) and db.get(Diagnosis, y.diagnosis_id).retake_of is None)

r = subprocess.run(alembic + ["downgrade", "f4a5b6c7d8e9"], cwd=HERE, env=env, capture_output=True, text=True)
check("downgrade runs", r.returncode == 0, r.stderr[-300:])
print(f"{sum(ok)}/{len(ok)} passed")
