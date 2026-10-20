# Sproutly

**Crop disease diagnosis that knows when it isn't sure.** A farmer photographs a maize,
tomato or potato leaf; Sproutly names the disease only when its *calibrated* confidence is
high enough, and otherwise sends the case to an agricultural extension officer in the
farmer's county instead of guessing.

Built for smallholder farmers in Kenya as a final-year project (Strathmore University,
BSc Informatics and Computer Science, 2026).

---

## Contents

1. [How it works](#how-it-works)
2. [Who uses it](#who-uses-it)
3. [What's in this repository](#whats-in-this-repository)
4. [Setting it up](#setting-it-up)
5. [Your first walkthrough](#your-first-walkthrough)
6. [Settings](#settings)
7. [The model and its results](#the-model-and-its-results)
8. [Security and privacy](#security-and-privacy)
9. [Checks and tests](#checks-and-tests)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)
12. [Data sources and credits](#data-sources-and-credits)

---

## How it works

```
Farmer takes a photo ──► model (ResNet-50) ──► calibrated confidence
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                 confidence ≥ 0.877                                   confidence < 0.877
                         │                                                   │
          diagnosis + advice from a                      "We're not sure": the case goes to an
          reviewed, cited advice library                 extension officer in the farmer's county
                                                         (only with the farmer's consent)
                                                                             │
                                                         officer judges the photo BEFORE seeing the
                                                         model's guess, then replies; the farmer
                                                         sees the reply under "Your checks"
```

Most disease apps always give an answer. On unfamiliar field photos, that answer is often
wrong while looking certain. Sproutly's model is *calibrated* (temperature scaling, T = 3.04)
so that "90% sure" really means about 90% right, and anything below the threshold is
referred to a person. On new field photos from other countries, this cut the wrong answers
given to farmers from 24% to 0.5% (see [results](#the-model-and-its-results)).

## Who uses it

| Person | Uses | Can do |
|---|---|---|
| **Farmer** | Mobile app (Android, Expo) | Sign up (phone or email + password + authenticator app, or Continue with Google), check one or several leaf photos, read the result and advice, choose whether to share an uncertain case with an officer, see past checks and officers' replies, find county support contacts |
| **Extension officer** | Web portal | Claim referred cases from their own county, judge each photo before seeing the model's guess, reply with optional advice from the library |
| **Administrator** | Web portal | Overview figures, create officer accounts, manage county contacts and the advice library, view model settings and the audit log |

There is no sign-up for staff: the first administrator is created on the server, and
administrators create officer accounts.

## What's in this repository

| Folder | What it is | Built with |
|---|---|---|
| [`sproutly-backend/`](sproutly-backend/) | API: accounts and sign-in, diagnosis, referrals, admin features; runs the model | Python 3.12, FastAPI, PostgreSQL, Alembic, PyTorch (CPU) |
| [`sproutly-mobile/`](sproutly-mobile/) | Farmer app | React Native (Expo 57), NativeWind |
| [`sproutly-admin/`](sproutly-admin/) | Officer and administrator portal | React 19, Vite, Tailwind CSS ([details](sproutly-admin/README.md)) |
| [`ml/`](ml/) | Data preparation, training, calibration and evaluation notebooks | Google Colab ([details](ml/README.md)) |

Datasets and trained models are large, so they live on Google Drive, not in Git.

---

## Setting it up

This runs everything on one laptop, with the farmer app on an Android phone on the
**same Wi-Fi network**. Plan about 30–45 minutes the first time.

### What you need

| Tool | Version | Why |
|---|---|---|
| [Git](https://git-scm.com/) | any recent | to get the code |
| [Python](https://www.python.org/) | 3.12 | backend |
| [Node.js](https://nodejs.org/) | 22 | portal and mobile app |
| [PostgreSQL](https://www.postgresql.org/download/) | 15 or newer | database |
| [Expo Go](https://expo.dev/go) | from the Play Store | runs the farmer app on your phone |
| An authenticator app | Google or Microsoft Authenticator | every password sign-in asks for its 6-digit code |
| **The trained model file** `model.pt` (about 90 MB) | — | not in Git; ask the author for the Drive link (`CropDiseaseDiagnosis/models/compare_resnet50/model.pt`). **The backend will not start without it.** |

Optional, only for **Continue with Google**: a Google Cloud OAuth client and
[ngrok](https://ngrok.com/) (see [step 6](#6-optional-continue-with-google)).

Commands below are for **Windows PowerShell**; on macOS/Linux use `source .venv/bin/activate`
and `cp` instead of `copy`.

### 1. Get the code

```powershell
git clone https://github.com/BilliartMuthoni/confidence-calibrated-crop-diagnosis.git Sproutly-app
cd Sproutly-app
```

### 2. Create the database

Make sure PostgreSQL is running, then create an empty database (pgAdmin works too):

```powershell
psql -U postgres -c "CREATE DATABASE sproutly;"
```

### 3. Start the backend

```powershell
cd sproutly-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Open `.env` and fill in the three empty values:

| Setting | What to put |
|---|---|
| `SECRET_KEY` | the output of `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | `postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/sproutly` |
| `TOTP_ENCRYPTION_KEY` | the output of `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` — set it once and never change it, or every authenticator stops working |

Put the model file at `sproutly-backend/models/compare_resnet50/model.pt`, then:

```powershell
alembic upgrade head                                             # creates the tables
python -m app.scripts.create_admin --email you@example.org --name "Your Name"   # asks for a password (12+ characters)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Keep this window open. The API is at http://localhost:8000, and its interactive
documentation at http://localhost:8000/docs. `--host 0.0.0.0` lets your phone reach it.

Optional: load reviewed treatment advice into the library with
`python -m app.scripts.import_advice path\to\advice.csv` (advice can also be added in the portal).

### 4. Start the portal (officers and administrators)

In a **second** window:

```powershell
cd sproutly-admin
copy .env.example .env      # already points at http://localhost:8000
npm install
npm run dev
```

Open http://localhost:5173.

### 5. Start the farmer app

In a **third** window:

```powershell
cd sproutly-mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. The app finds the backend by itself (it uses
your laptop's address on the Wi-Fi), so nothing needs configuring as long as the phone and
laptop are on the same network. If the app can't connect, see
[troubleshooting](#troubleshooting).

### 6. Optional: Continue with Google

Google only sends people back to an **https** address, which your laptop doesn't have, so a
tunnel provides one:

1. Start a tunnel in a **fourth** window: `ngrok http 8000`. Note the `https://….ngrok-free.app`
   address (claim a free fixed domain on ngrok so it stays the same).
2. In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
   Credentials, create an **OAuth client ID** (Web application) with the redirect URI
   `https://YOUR-NGROK-ADDRESS/auth/oauth/google/callback`.
3. In `sproutly-backend/.env` set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
   `PUBLIC_BASE_URL=https://YOUR-NGROK-ADDRESS`.
4. Create `sproutly-mobile/.env` with `EXPO_PUBLIC_API_URL=https://YOUR-NGROK-ADDRESS`.
5. Restart the backend and Expo. The app now shows **Continue with Google**.

If the ngrok address changes, update it in all three places.

---

## Your first walkthrough

1. **Administrator:** sign in at http://localhost:5173 with the account from step 3. The first
   sign-in shows a QR code: scan it with your authenticator app and enter the 6-digit code.
   Save the backup codes it offers (My account) somewhere safe.
2. **Create an officer:** Users → *Create an officer*, choose a county (e.g. Nakuru). The portal shows
   a one-time link; open it (in a private window) to choose the officer's password.
3. **Add a support contact** for that county under *County contacts*, so farmers there see who
   to call.
4. **Farmer:** in the app, *Get started* → *Sign up* with a phone number or email and a password,
   then add Sproutly to your authenticator app. On *Profile*, choose the same county (Nakuru).
5. **Check a leaf:** *Check a leaf* → pick the crop and take or choose a photo. Tick *Send my
   photo to an extension officer in my county* (used only if Sproutly isn't sure) and, if you
   like, *The officer may phone me*. A clear photo of a familiar disease gets a diagnosis with
   advice; an unclear one says Sproutly isn't sure and goes to the officer.
6. **Officer:** sign in to the portal as the officer, open *Referrals*, claim the case, choose
   your own judgement from the list (the model's guess is hidden until you do), then reply.
7. **Farmer:** open *Your checks* in the app to see the officer's reply.

## Settings

All backend settings are in `sproutly-backend/.env`; [`.env.example`](sproutly-backend/.env.example)
explains each one. The ones you are most likely to change:

| Setting | Default | Meaning |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | 0.877 | below this calibrated confidence the farmer is referred (chosen in notebook 13b) |
| `TEMPERATURE` | 3.04 | calibration; 1.0 switches it off |
| `ML_MODEL_PATH` | `models/compare_resnet50/model.pt` | which trained model to load |
| `REFERRAL_DAYS` | 7 | days an officer has to answer before a referral expires |
| `LOCKOUT_ATTEMPTS` / `LOCKOUT_MINUTES` | 5 / 15 | wrong passwords or codes before an account is paused, and for how long |
| `STAFF_SESSION_MINUTES` | 480 | longest staff session (the portal also signs out after 30 idle minutes) |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | browser addresses allowed to use the API (the portal's) |

Never commit `.env` files: they hold passwords and keys.

## The model and its results

| | |
|---|---|
| Image model | ResNet-50, chosen from six architectures on field photos (notebook 09/10) |
| Calibration | temperature scaling, T = 3.04, fitted on unseen field photos (notebook 13) |
| Referral threshold | 0.877 (notebook 13b) |
| Accuracy on the test photos (same sources as training) | macro-F1 0.994 |
| Speed | about 0.2 s per photo on a laptop CPU |

What calibration and the threshold changed, compared with the earlier uncalibrated 0.90 rule:

| Photos | Wrong answers given to farmers | Share sent to an officer |
|---|---|---|
| New field photos from Bangladesh and Ethiopia (never seen in training) | 24.0% → **0.5%** | 97% |
| PlantDoc (internet photos, never seen in training) | 30.8% → **4.0%** | 90% |
| Test photos from the training sources | answers 99.9% right | 23% |

These numbers say plainly that the model is reliable on photos like its training data and
**not** on unfamiliar ones, which is exactly why uncertain cases go to a person. Work to
improve accuracy on new field photos (decision D17: more field training data) is in progress.
Every notebook, decision and result file is in [`ml/`](ml/).

## Security and privacy

- **Passwords** are stored only as bcrypt hashes (cost 12, salted); no one can read them back.
- **Two-step sign-in:** every password account uses an authenticator app (TOTP). Secrets are
  encrypted in the database, and a code can't be reused. Ten single-use **backup codes**
  (stored hashed) cover a lost phone.
- **Lockout:** 5 wrong passwords or codes in a row pause the account for 15 minutes.
- **Continue with Google** uses OAuth 2.0 with PKCE; Sproutly never sees the Google password.
  Joining Google to an existing password account first asks for that account's password and
  code, so nobody can attach their Google account to someone else's. Staff can't use Google.
- **Roles are enforced on the server:** officers see only their own county; only officers judge
  and reply; administrators oversee. Administrators exist only through the server command.
- **Audit log** of staff actions; one-time staff links are stored hashed and expire.
- **Farmer consent:** a case reaches an officer only if the farmer ticks *Send my photo to an
  extension officer*, and the farmer's phone number only with a separate *The officer may
  phone me* tick. A personal mobile number of
  a support contact is shown to farmers only with that person's recorded consent (Kenya Data
  Protection Act 2019, s.30 and s.32).
- **Photos:** resized and stripped of location (EXIF/GPS) data on upload.

## Checks and tests

Every pull request runs [CI](.github/workflows/ci.yml): backend lint and compile, ML lint and
notebook validation, portal lint and build, and the mobile dependency install. Locally:

```powershell
cd sproutly-backend; ruff check . --select E9,F63,F7,F82     # same rules as CI
cd ..\sproutly-admin; npm run lint; npm run build
```

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| Backend stops at start with a missing-file error | `model.pt` isn't at `ML_MODEL_PATH` (step 3) |
| "Failed to fetch" in the portal / "Can't reach Sproutly" in the app | the backend or PostgreSQL isn't running; check the backend window |
| `column ... does not exist` | run `alembic upgrade head` after pulling new code |
| The app can't connect but the portal can | phone and laptop on different Wi-Fi, or Windows Firewall blocking port 8000 (allow Python on private networks) |
| `ERR_NGROK_3200` | the ngrok window was closed; start it again (and update the address if it changed) |
| "Please log in again, your session has ended" after reopening the app | known issue: sessions last 15 minutes until the refresh step is added (#38) |
| Wrong authenticator code | the code changes every 30 seconds; check the phone's time is set automatically |

## Known limitations

- Accuracy on unfamiliar field photos is low (57% on the selection set before referral),
  so most such photos are referred rather than diagnosed. D17 is testing more field training data.
- The optional symptom description is saved but not yet used by the model.
- Email addresses and phone numbers are not verified at sign-up yet (email verification is next).
- The app needs a connection; it does not work offline.
- It runs on a laptop for development; it is not deployed to a server yet.

## Data sources and credits

Training and evaluation use PlantVillage, FieldPlant, a Tanzanian potato field dataset and
PlantDoc (evaluation only), plus CC BY 4.0 field datasets from Mendeley Data for calibration.
Each source's citation and licence is recorded next to the notebook that uses it in
[`ml/results/`](ml/results/). Every advice-library entry is stored with its source title, link
and licence.

**Author:** Mwangi Billiart B. Muthoni, Strathmore University.
