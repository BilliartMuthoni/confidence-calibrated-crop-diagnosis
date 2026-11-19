"""Scratch test for t49 (fake env, SQLite, cwd = this folder; never loads the real .env)."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "a.db")
if os.path.exists(DB):
    os.remove(DB)
from cryptography.fernet import Fernet  # noqa: E402

os.environ.update({"DATABASE_URL": f"sqlite:///{DB}", "SECRET_KEY": "test-secret-key-not-real-0123456789abcdef",
                   "TOTP_ENCRYPTION_KEY": Fernet.generate_key().decode(), "APP_ENV": "development",
                   "SMTP_HOST": "", "GROQ_API_KEY": ""})
BACK = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, BACK)
env = dict(os.environ, PYTHONPATH=BACK)
alembic = [sys.executable, "-m", "alembic", "-c", os.path.join(BACK, "alembic.ini")]
checks = []


def check(name, ok):
    checks.append(ok)
    print("PASS" if ok else "FAIL", name)


r = subprocess.run(alembic + ["upgrade", "head"], cwd=HERE, env=env, capture_output=True, text=True)
check("alembic upgrade head", r.returncode == 0)
if r.returncode:
    print(r.stderr[-800:])
r = subprocess.run(alembic + ["current"], cwd=HERE, env=env, capture_output=True, text=True)
check("head is e6f7a8b9c0d1", "e6f7a8b9c0d1" in r.stdout)

# Import the built CSV with the real script.
csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "ml", "data", "advice", "advice.csv")
r = subprocess.run([sys.executable, "-m", "app.scripts.import_advice", csv_path], cwd=HERE, env=env,
                   capture_output=True, text=True)
print(r.stdout[-400:], r.stderr[-400:])
check("import_advice runs", r.returncode == 0)

from app.db.session import SessionLocal  # noqa: E402
from app.models import advice as _a, audit, contact, diagnosis, oauth_flow, referral, staff_auth  # noqa: E402,F401
from app.models.user import User  # noqa: E402,F401
from app.models.advice import AdviceEntry, AdviceKind  # noqa: E402
from app.core.knowledge_base import get_guidance  # noqa: E402
from app.core import assistant  # noqa: E402

db = SessionLocal()
counts = {k: db.query(AdviceEntry).filter(AdviceEntry.kind == k).count() for k in AdviceKind}
print(counts)
check("130 entries imported", sum(counts.values()) == 130)
check("about 37, harvest 7", counts[AdviceKind.about] == 37 and counts[AdviceKind.harvest] == 7)

g = get_guidance("Potato___Late_blight", db)
check("result guidance keys unchanged", set(g) == {"summary", "treatment", "prevention", "sources"})
check("result treatment 9, prevention 11", len(g["treatment"]) == 9 and len(g["prevention"]) == 11)
about_texts = {e.text for e in db.query(AdviceEntry).filter(AdviceEntry.kind == AdviceKind.about)}
check("no about text on the result", not (set(g["treatment"]) | set(g["prevention"])) & about_texts)
check("sources only from result kinds", not any("Pakistan" in s for s in g["sources"])
      or any(e.kind in (AdviceKind.treatment, AdviceKind.prevention) and "Pakistan" in e.source_title
             for e in db.query(AdviceEntry).filter(AdviceEntry.disease == "Potato___Late_blight")))

# Assistant with a fake provider: an about pick gets the About heading; harvest likewise.
entries = assistant._entries(db, "Potato___Late_blight")
about = [e.advice_id for e in entries if e.kind == AdviceKind.about][:2]
harvest = [e.advice_id for e in entries if e.kind == AdviceKind.harvest][:2]
r1 = assistant._to_reply("show_advice", {"advice_ids": about}, entries, "Potato___Late_blight")
r2 = assistant._to_reply("show_advice", {"advice_ids": harvest}, entries, "Potato___Late_blight")
print(r1.message, "|", r2.message)
check("about heading", r1.message.startswith("About ") and {a["kind"] for a in r1.advice} == {"about"})
check("harvest heading", r2.message.startswith("Harvesting and storing") and {a["kind"] for a in r2.advice} == {"harvest"})
prompt = assistant._system_prompt("Potato___Late_blight", entries)
check("prompt lists about entries", "(about)" in prompt and "(harvest)" in prompt)
check("what_to_know has 3 choices", len(assistant.QUESTIONS["what_to_know"][1]) == 3)
tl = assistant._entries(db, "Tomato___Late_blight")
r3 = assistant._to_reply("show_advice", {"advice_ids": [e.advice_id for e in tl if e.kind == AdviceKind.about][:1]}, tl, "Tomato___Late_blight")
print(r3.message)
check("barafu in heading", "(also called barafu)" in r3.message)
g1 = assistant._to_reply("small_talk", {"kind": "greeting"}, entries, "Potato___Late_blight")
print(g1.message, g1.choices)
check("greeting names result and offers 3 topics", "Potato Late Blight" in g1.message and len(g1.choices) == 3)
g2 = assistant._to_reply("small_talk", {"kind": "greeting"}, [], "Potato___healthy")
print(g2.message, g2.choices)
check("healthy greeting has 1 topic", g2.choices == ["How to keep my crop healthy"])
o = assistant._to_reply("out_of_scope", {}, entries, "Potato___Late_blight")
print(o.message)
check("off-topic has topic buttons", len(o.choices) == 3 and "For anything else" in o.message)
s = assistant._to_reply("safety", {"reason": "someone_hurt"}, entries, "Potato___Late_blight")
check("someone_hurt: 999, no buttons", "999" in s.message and "1199" in s.message and s.choices == [])
h = assistant._to_reply("safety", {"reason": "harmful_request"}, entries, "Potato___Late_blight")
check("harmful: refusal with topics", h.message.startswith("I can't help") and len(h.choices) == 3)
try:
    assistant._to_reply("safety", {"reason": "other"}, entries, "Potato___Late_blight"); check("bad option rejected", False)
except assistant.Unavailable:
    check("bad option rejected", True)
check("tools list has small_talk and safety", {t["function"]["name"] for t in assistant._tools(entries)} >= {"small_talk", "safety"})
f = assistant._to_reply("refer_to_officer", {"reason": "food_safety"}, entries, "Potato___Late_blight")
check("food_safety reply", f.kind == "officer" and "safe to eat" in f.message and "food_safety" in assistant._system_prompt("Potato___Late_blight", entries))
db.close()

r = subprocess.run(alembic + ["downgrade", "d5e6f7a8b9c0"], cwd=HERE, env=env, capture_output=True, text=True)
check("downgrade one step", r.returncode == 0)
import sqlite3  # noqa: E402
con = sqlite3.connect(DB)
left = con.execute("SELECT count(*), sum(kind IN ('about','harvest')) FROM advice_entries").fetchone()
print("after downgrade:", left)
check("downgrade removed the new kinds only", left == (86, 0))
con.close()
r = subprocess.run(alembic + ["upgrade", "head"], cwd=HERE, env=env, capture_output=True, text=True)
check("upgrade again", r.returncode == 0)

print(f"\n{sum(checks)}/{len(checks)} passed")
