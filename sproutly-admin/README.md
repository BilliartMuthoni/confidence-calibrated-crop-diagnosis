# Admin Portal

React web app for administrators. Talks to the FastAPI backend in
[`../sproutly-backend`](../sproutly-backend).

## Stack

- React 19 + Vite
- React Router (data router, `src/router.jsx`)
- Tailwind CSS v4 — brand colours in `src/index.css`, shared with the mobile app
- oxlint

## Getting started

```bash
cp .env.example .env      # point VITE_API_URL at the backend
npm install
npm run dev               # http://localhost:5173
```

The backend must allow this origin — `CORS_ORIGINS` in `sproutly-backend/.env`
defaults to `http://localhost:5173`.

There is no sign-up. The first administrator is created on the server (inside
`sproutly-backend`, after `alembic upgrade head`):

```bash
python -m app.scripts.create_admin --email you@example.org --name "Your Name"
```

The password is typed at a hidden prompt; the authenticator app is set up at the first
sign-in. Officers are created from the Users page, which gives a one-time link for them to
choose a password (it points at `ADMIN_PORTAL_URL` in the backend's settings).

## Pages

| Page | Admin | Extension officer |
|---|---|---|
| Sign in (password, then authenticator code; first sign-in sets the authenticator up) | yes | yes |
| Overview: checks, share referred, waiting and soon-expiring referrals, officer-model agreement, results, counties, confidence of referred cases | yes | - |
| Referrals: claim a case, judge it from a fixed list before seeing the model's guess, reply with optional library advice | view all counties, release abandoned claims | claim and answer, own county only |
| County contacts: type, hours and last-checked date; shown to farmers on the app's Support contacts screen | edit | view |
| Users: list, last sign-in, deactivate, reset password or authenticator, move an officer's county, create officer accounts | yes | - |
| Advice library: cited excerpts, missing-advice check, corrections saved as versions, retire not delete | edit | view |
| Model settings (read-only): each part with its notebook, results folder and commit | yes | - |
| Audit log (read-only): who did what, when | yes | - |
| My account: change password, move the authenticator to a new phone, backup codes, recent sign-ins | yes | yes |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Layout

```
src/
├── main.jsx          entry point
├── router.jsx        route table
├── index.css         Tailwind + theme colours
├── api/client.js     fetch wrapper: base URL, JSON, bearer token, errors
├── api/admin.js      every call the portal makes to the backend
├── auth/             signed-in session (sessionStorage, ends when the tab closes or after 30 idle minutes)
├── components/       layout, route guard and shared UI
├── lib/              formatting helpers and the data-loading hook
└── pages/            one file per route
```
