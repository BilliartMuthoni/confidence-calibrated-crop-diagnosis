# Backend

FastAPI service behind the farmer app and the staff portal: accounts and sign-in, diagnosis
with the trained model, referrals to extension officers, and the admin features.

**Setup** (database, `.env`, migrations, first administrator, starting the server) is in the
[main README](../README.md#3-start-the-backend). Once running, every endpoint is listed and can
be tried at http://localhost:8000/docs.

## Stack

Python 3.12 · FastAPI · SQLAlchemy + PostgreSQL · Alembic migrations · PyTorch (CPU) for the
model · bcrypt (passwords), python-jose (JWT tokens), pyotp (authenticator codes), Fernet
encryption (authenticator secrets) · SlowAPI rate limiting.

## API areas

| Prefix | For | What it covers |
|---|---|---|
| `/auth` | everyone | sign up, log in, authenticator setup and codes, backup codes, password change, adding a password to a Google account |
| `/auth/oauth` | farmers | Continue with Google (OAuth 2.0 + PKCE), joining Google to an existing account |
| `/diagnose` | farmers | check one photo, several photos, correct the crop, history with officers' replies |
| `/contacts` | farmers | support contacts for the farmer's county |
| `/admin` | officers, admins | overview, referrals (claim, blind judgement, reply, release), users, contacts, advice library, model settings, audit log |

Roles are enforced here, not just hidden in the apps: `farmer`, `officer` (own county only;
the only role that judges and replies) and `admin` (oversight).

## Layout

```
sproutly-backend/
├── main.py            app, routers, model loaded at startup
├── alembic/versions/  database migrations, oldest first
├── models/            the trained model file (not in Git)
├── uploads/           farmers' photos, resized and stripped of GPS data (not in Git)
└── app/
    ├── core/          settings, security (passwords, tokens, TOTP), classifier, lockout,
    │                  referrals, image intake, audit log, Google sign-in, counties
    ├── models/        database tables
    ├── schemas/       request and response shapes
    ├── routers/       the endpoints above
    └── scripts/       create_admin, import_advice
```

## Everyday tasks

| Task | Command (inside `sproutly-backend`, virtual environment on) |
|---|---|
| Run the server | `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` |
| Apply new migrations after pulling | `alembic upgrade head` |
| Make a migration after changing a model | `alembic revision --autogenerate -m "what changed"`, then read and correct the file |
| Create an administrator | `python -m app.scripts.create_admin --email you@example.org --name "Your Name"` |
| Load advice from a CSV | `python -m app.scripts.import_advice path\to\advice.csv` |
| Lint like CI | `ruff check . --select E9,F63,F7,F82` |

## The model

`app/core/classifier.py` loads the file at `ML_MODEL_PATH` once at startup (the server refuses
to start without it; several comma-separated paths run as an ensemble), calibrates the scores
over all classes with `TEMPERATURE` to check the crop, and over the farmer's crop's classes with
`CROP_TEMPERATURE` for the confidence shown, then refers any photo whose confidence is below
`CONFIDENCE_THRESHOLD` or whose crop holds under half the probability. These settings come from
the ML notebooks (18b, 21); see [`ml/README.md`](../ml/README.md). Switching to another model
means changing all of them together.
