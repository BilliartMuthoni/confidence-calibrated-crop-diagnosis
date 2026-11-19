"""t47 scratch test (fake env, SQLite, fake AI provider; cwd = this folder)."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "t47.db")
if os.path.exists(DB):
    os.remove(DB)
from cryptography.fernet import Fernet  # noqa: E402

os.environ.update({"DATABASE_URL": f"sqlite:///{DB}", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "development",
                   "SMTP_HOST": "", "GROQ_API_KEY": ""})
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

from fastapi import HTTPException  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import advice as _a, audit, contact, diagnosis as _d, oauth_flow, referral as _r, staff_auth  # noqa: E402,F401
from app.models.user import User, UserRole  # noqa: E402
from app.models.diagnosis import Diagnosis, CropType  # noqa: E402
from app.models.referral import Referral  # noqa: E402
from app.core import assistant  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.routers import diagnosis as dr  # noqa: E402
from app.schemas.diagnosis import AssistantQuestion, DoubtRequest  # noqa: E402

# Fake provider: records what it was sent and returns a chosen tool call.
seen = {}
next_call = {"name": "referred_reply", "args": {"reason": "why_not_sure"}}


def fake(messages, tools):
    seen["messages"], seen["tools"] = messages, tools
    return next_call["name"], next_call["args"]


assistant.PROVIDERS["fake"] = fake
settings.assistant_provider = "fake"

PHOTO = os.path.join(HERE, "leaf47.jpg")
open(PHOTO, "wb").write(b"x")
db = SessionLocal()
farmer = User(user_email="f@x.org", role=UserRole.farmer, mfa_enabled=True, is_verified=True, failed_attempts=0,
              keep_questions=False)
db.add(farmer)
db.commit()
ref_check = Diagnosis(user_id=farmer.user_id, image_path=PHOTO, crop=CropType.tomato, confidence=0.41,
                      is_referred=True, top_class="Tomato___Late_blight", predicted_disease=None)
db.add(ref_check)
db.commit()


def ask(q, rec=ref_check):
    return getattr(dr.ask_assistant, "__wrapped__", dr.ask_assistant)(None, rec.diagnosis_id, AssistantQuestion(question=q), db, farmer)


rep = ask("why couldn't it tell?")
check("not-diagnosed check now gets an answer (no 409)", rep.kind == "referred" and rep.action == "retake")
system = seen["messages"][0]["content"]
check("prompt names the crop only, never the stored guess", "tomato" in system and "blight" not in system.lower())
names = {t["function"]["name"] for t in seen["tools"]}
check("no show_advice or refer_to_officer offered", "show_advice" not in names and "refer_to_officer" not in names)
check("no advice entries anywhere in the prompt", "Advice entries" not in system)

next_call.update(name="referred_reply", args={"reason": "send_to_officer"})
check("send_to_officer before sending -> send button", ask("can an expert look?").action == "send")
next_call.update(name="referred_reply", args={"reason": "dont_treat_yet"})
r2 = ask("what should I spray?")
check("don't treat yet message", "don't spray anything yet" in r2.message and r2.action == "send")
next_call.update(name="small_talk", args={"kind": "greeting"})
g = ask("hi")
check("greeting lists the three topics", g.choices == assistant.REFERRED_TOPICS)
next_call.update(name="show_advice", args={"advice_ids": [1]})
u = ask("anything")
check("a tool outside the menu -> unavailable, never advice", u.kind == "unavailable" and not u.advice)

# Send later: a not-diagnosed check that was not shared.
out = getattr(dr.doubt_diagnosis, "__wrapped__", dr.doubt_diagnosis)(None, ref_check.diagnosis_id, DoubtRequest(consent=True, county="Nakuru"), db, farmer)
ref = db.query(Referral).filter(Referral.diagnosis_id == ref_check.diagnosis_id).one()
check("not-diagnosed check sent later as an ordinary case", ref.reason is None and out.sent_to_officer)
next_call.update(name="referred_reply", args={"reason": "send_to_officer"})
a = ask("can an officer see it?")
check("after sending: 'already sent', no button", a.message == assistant.ALREADY_SENT and a.action is None)

# Diagnosed checks still use the normal assistant.
diag = Diagnosis(user_id=farmer.user_id, image_path=PHOTO, crop=CropType.potato, confidence=0.99,
                 is_referred=False, top_class="Potato___Late_blight", predicted_disease="Potato Late Blight")
db.add(diag)
db.commit()
next_call.update(name="out_of_scope", args={})
d = ask("who won the match?", diag)
check("diagnosed check still uses the disease assistant", "Potato Late Blight" in d.message)
db.close()
print(f"\n{sum(ok)}/{len(ok)} passed")
