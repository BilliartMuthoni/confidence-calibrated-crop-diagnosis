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

Until the admin API exists the portal runs on **sample data** (`VITE_USE_SAMPLE_DATA`, on
by default): made-up referrals, contacts, users and advice, with a banner on every page.
The login page lists the sample accounts. Set it to `false` to use the backend.

## Pages

| Page | Admin | Extension officer |
|---|---|---|
| Sign in (password, then authenticator code; first sign-in sets the authenticator up) | yes | yes |
| Overview: checks, share referred, waiting referrals, results, counties, confidence of referred cases | yes | - |
| Referrals: queue and reply (officers see their own county only) | all counties | own county |
| County contacts: shown to farmers on the app's Support contacts screen | edit | view |
| Users: list, deactivate, create officer accounts | yes | - |
| Advice library: cited excerpts, corrections saved as versions, retire not delete | edit | view |
| Model settings (read-only) | yes | - |

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
├── api/admin.js      every call the portal makes (sample data or the backend)
├── api/sampleData.js made-up data for sample mode
├── auth/             signed-in session (sessionStorage, ends when the tab closes)
├── components/       layout, route guard and shared UI
├── lib/              formatting helpers and the data-loading hook
└── pages/            one file per route
```
