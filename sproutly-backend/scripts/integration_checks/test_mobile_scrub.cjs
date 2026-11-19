// App crash monitoring (D2, tracker g09): crashes and unexpected errors in the app are reported to
// Sentry, in the same EU organisation as the backend (app/core/monitoring.py), so a person hears
// about them. Off unless EXPO_PUBLIC_SENTRY_DSN is set.
//
// Only errors: no performance tracing, no session tracking, no screenshots, no breadcrumbs (they
// could hold what was typed or shown). Before anything is sent, the user and request details are
// removed and email addresses, phone numbers and sign-in tokens in the remaining text are
// replaced. Farmers' photos are never attached.
const Sentry={init:(o)=>{globalThis.__opts=o}};

const DSN = globalThis.__dsn || '';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Kenyan numbers as farmers type them: 07..., 01..., +254..., 254... (spaces or dashes allowed)
const PHONE = /(?:\+?254|0)[17](?:[\s-]?\d){8}/g;
// Access and refresh tokens (JWT) and "Bearer ..." headers that end up in an error message.
const TOKEN = /\bBearer\s+[\w.-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

function scrubText(value) {
    if (typeof value !== 'string') return value;
    return value.replace(TOKEN, '[token]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

function scrub(obj) {
    if (Array.isArray(obj)) return obj.map(scrub);
    if (obj && typeof obj === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(obj)) out[key] = scrub(val);
        return out;
    }
    return scrubText(obj);
}

/** Strip everything that could identify a farmer before a report leaves the phone. */
function beforeSend(event) {
    delete event.user;
    delete event.request;
    delete event.breadcrumbs;
    for (const key of ['message', 'logentry', 'exception', 'extra', 'contexts', 'tags']) {
        if (key in event) event[key] = scrub(event[key]);
    }
    return event;
}

/** Start Sentry when the app was built with a DSN; returns whether it is on. */
function initMonitoring() {
    if (!DSN) return false;
    Sentry.init({
        dsn: DSN,
        environment: __DEV__ ? 'development' : 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        enableAutoSessionTracking: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        maxBreadcrumbs: 0,
        beforeSend,
    });
    return true;
}
globalThis.__DEV__ = false;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
ok(scrubText('call 0712 345 678 now') === 'call [phone] now', 'phone 07 spaced');
ok(scrubText('+254712345678') === '[phone]', 'phone +254');
ok(scrubText('0112-345-678') === '[phone]', 'phone 01 dashed');
ok(scrubText('mail a.b+c@example.org') === 'mail [email]', 'email');
ok(scrubText('Authorization: Bearer abc.def-ghi') === 'Authorization: [token]', 'bearer');
ok(scrubText('t=eyJhbGci.eyJzdWIi.sig_12-3') === 't=[token]', 'jwt');
ok(scrubText('Request failed with status code 500') === 'Request failed with status code 500', 'plain text kept');
ok(scrubText(42) === 42, 'non-string kept');
const ev = beforeSend({ user: { id: 1 }, request: { url: 'x' }, breadcrumbs: [{ message: 'typed 0712345678' }],
  exception: { values: [{ type: 'TypeError', value: 'bad user 0712345678 x@y.com', stacktrace: { frames: [{ filename: 'app.js', lineno: 3 }] } }] },
  extra: { note: 'Bearer abc' }, tags: { screen: 'Result' } });
ok(!('user' in ev) && !('request' in ev) && !('breadcrumbs' in ev), 'user/request/breadcrumbs removed');
ok(ev.exception.values[0].value === 'bad user [phone] [email]', 'exception text scrubbed');
ok(ev.exception.values[0].stacktrace.frames[0].lineno === 3 && ev.exception.values[0].type === 'TypeError', 'stack kept');
ok(ev.extra.note === '[token]' && ev.tags.screen === 'Result', 'extra scrubbed, tags kept');
globalThis.__dsn = ''; ok(initMonitoring() === false && !globalThis.__opts, 'off without DSN');
console.log(`${pass}/${pass + fail} passed`);
