# Integration checks

Scripts behind the integration test results in the report (Table 5.20). Each one runs a backend
feature end to end against a throwaway SQLite database with fake settings: no real account,
credential, SMS, email or AI call is involved. Codes that would be sent are captured instead,
and the image models and the AI provider are replaced by stand-ins.

These are **not** run by CI (CI runs only `pytest tests`), and none of them touches the deployed
server.

## How to run

From this folder, with the backend's virtual environment active:

```
python test_phone_and_reset.py
node test_mobile_scrub.cjs
```

Run them from this folder only. The backend reads a `.env` file from the current folder, and this
folder has none, so the scripts use only the fake settings they set themselves. Each script
creates its own `.db` file here and deletes it on the next run (`.gitignore` keeps them out of Git).

## Scripts and results

| Report row (Table 5.20) | Script | Recorded run (10 Nov 2026) | Rerun (20 Nov 2026) |
|---|---|---|---|
| Phone numbers, password reset, and their migration | `test_phone_and_reset.py` | 52 of 52 | 52 of 52 |
| Complete sign-in | `test_full_signin.py` | 19 of 19 | 19 of 19 |
| Email confirmation | `test_email_verification.py` | 36 of 36 | stops at the SMS check (see below) |
| SMS confirmation | `test_sms.py` | 25 of 25 | stops at the first send (see below) |
| Advice on the result, retake linking, other crops | `test_n22.py`, `test_advice_kinds.py`, `test_other_crop.py` | not saved | 22 of 23, 22 of 25, 6 of 6 (see below) |
| Not-diagnosed assistant | `test_t47.py` | 12 of 12 | 12 of 12 |
| Error-report scrubbing, server | `test_d1.py` | not saved | 14 of 14 |
| Error-report scrubbing, application | `test_mobile_scrub.cjs` | not saved | 13 of 13 |

`recorded_runs/` holds the outputs saved when the checks were first run; `rerun_2026-11-20/` holds
today's outputs. Local folder paths were removed from the rerun outputs.

## Why some reruns differ

The scripts were written for the code as it was on the day they ran, and three later changes make
parts of them out of date:

- Several scripts check that the database is at a named migration. Later migrations moved the
  head, so that one check fails ("head is ...") while the behaviour checks after it still pass.
- The SMS sender now posts JSON to Africa's Talking and reports a line that blocks promotional
  messages. The fake provider in `test_sms.py` and `test_email_verification.py` predates both, so
  those scripts stop at the first SMS.
- The result screen later gained "About this disease" entries, which changes two expectations in
  `test_advice_kinds.py`.

`test_mobile_scrub.cjs` contains a copy of the filter in `sproutly-mobile/src/utils/monitoring.js`;
if that file changes, update the copy.
