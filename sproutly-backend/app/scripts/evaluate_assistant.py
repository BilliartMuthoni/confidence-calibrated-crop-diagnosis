"""Evaluate the assistant (D9) on the fixed question set, with the real provider.

Run inside sproutly-backend, after importing the advice library and with GROQ_API_KEY set:

    python -m app.scripts.evaluate_assistant tune
    python -m app.scripts.evaluate_assistant report

The 50 questions in assistant_questions.csv are split in half before any run. "tune" is for
adjusting the prompt and tool descriptions; "report" is run once, after tuning is finished,
and is the number reported. A question is answered correctly when the model chose the
expected tool and, for advice, only entries of the expected kind (treatment or prevention),
or for a hand-over or question, the expected reason. Requests are spaced out to stay inside
the free tier's per-minute token limit; one 429 is waited out and retried.
"""

import csv
import sys
import time
from pathlib import Path

from app.core import assistant
from app.db.session import SessionLocal
from app.models import advice as _advice, audit as _audit, contact, diagnosis, oauth_flow, referral, staff_auth  # noqa: F401
from app.models.user import User  # noqa: F401

QUESTIONS = Path(__file__).with_name("assistant_questions.csv")
PAUSE_SECONDS = 10


def _ask(db, row):
    for attempt in range(2):
        try:
            return assistant.choose(db, row["disease"], row["question"]), ""
        except assistant.Unavailable as exc:
            if "HTTP 429" in str(exc) and attempt == 0:
                print("  limit reached, waiting 60 s")
                time.sleep(60)
                continue
            return None, str(exc)


def main(split: str) -> int:
    rows = [r for r in csv.DictReader(QUESTIONS.open(encoding="utf-8")) if split == "all" or r["split"] == split]
    if not rows:
        print("Choose tune, report or all")
        return 1
    db = SessionLocal()
    results = []
    try:
        for n, row in enumerate(rows, 1):
            reply, failure = _ask(db, row)
            kinds = sorted({a["kind"] for a in reply.advice}) if reply else []
            tool = reply.tool if reply else "unavailable"
            option = (",".join(kinds) if tool == "show_advice" else reply.option or "") if reply else ""
            right_tool = tool == row["expected_tool"]
            correct = right_tool and (not row["expected_option"] or option == row["expected_option"])
            results.append({**row, "chosen_tool": tool, "chosen_option": option, "right_tool": right_tool,
                            "correct": correct, "failure": failure})
            print(f"{n:>2}/{len(rows)} {'OK ' if correct else 'NO '} {row['question'][:60]!r} -> {tool} {option} {failure}")
            time.sleep(PAUSE_SECONDS)
    finally:
        db.close()

    out = Path(f"assistant_evaluation_{split}.csv")
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    total = len(results)
    print(f"\n{split}: {sum(r['correct'] for r in results)}/{total} correct, "
          f"{sum(r['right_tool'] for r in results)}/{total} right tool, "
          f"{sum(r['chosen_tool'] == 'unavailable' for r in results)} unavailable")
    for tool in ("show_advice", "refer_to_officer", "ask_farmer", "out_of_scope"):
        part = [r for r in results if r["expected_tool"] == tool]
        if part:
            print(f"  {tool}: {sum(r['correct'] for r in part)}/{len(part)}")
    print("Free text shown to farmers: none possible (the model only chooses a tool).")
    print("Saved", out.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "tune"))
