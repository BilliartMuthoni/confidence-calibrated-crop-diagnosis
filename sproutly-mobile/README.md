# Farmer App

React Native app (Expo) for farmers: check a leaf photo, read the result and advice, send
uncertain cases to an extension officer, and see past checks and officers' replies.

**Setup** is in the [main README](../README.md#5-start-the-farmer-app): `npm install`, then
`npx expo start` and scan the QR code with Expo Go on an Android phone on the same Wi-Fi as
the laptop running the backend.

## How the app finds the backend

In development the app uses the address it was loaded from (your laptop on the Wi-Fi) with
port 8000, so changing networks needs no edit. To use a fixed address instead, e.g. an ngrok
tunnel for Continue with Google, create `sproutly-mobile/.env` with:

```
EXPO_PUBLIC_API_URL=https://YOUR-ADDRESS
```

and restart Expo. See [`src/constants/api.js`](src/constants/api.js).

## Screens

| Screen | What the farmer does there |
|---|---|
| Landing, Sign up, Log in | create an account with a phone number or email and a password, or Continue with Google |
| Authenticator setup, Enter your code | add Sproutly to an authenticator app; enter its 6-digit code at each password log-in |
| Connect Google | join Google to an existing password account (asks for that account's password and code once) |
| Home | start a check, recent checks |
| Check a leaf | choose the crop (or "Not sure / mixed"), add one or several photos and an optional description, and choose whether an officer may see an uncertain case and phone back |
| Result, Batch result | the diagnosis and confidence with advice, or "not sure" with what happens next |
| Your checks | every past check, filters, and officers' replies |
| Support contacts | county agricultural contacts |
| Profile | county (routes referrals and contacts), log out |

## Layout

```
sproutly-mobile/
├── App.js             navigation: sign-in screens, or the farmer screens once logged in
└── src/
    ├── api/           calls to the backend (auth, Google sign-in, diagnosis, contacts, session expiry)
    ├── components/    shared pieces: bottom bar, error banner, code input, county picker
    ├── constants/     colours, theme, backend address, counties
    ├── context/       the signed-in session
    ├── screens/       auth/ and farmer/ screens
    └── utils/         friendly error messages, time labels, farmer county
```

Error messages shown to farmers are written in one place,
[`src/utils/errorMessages.js`](src/utils/errorMessages.js): each says what happened and what
to do next.
