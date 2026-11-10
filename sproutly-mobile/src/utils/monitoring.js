// App crash monitoring (D2, tracker g09): crashes and unexpected errors in the app are reported to
// Sentry, in the same EU organisation as the backend (app/core/monitoring.py), so a person hears
// about them. Off unless EXPO_PUBLIC_SENTRY_DSN is set.
//
// Only errors: no performance tracing, no session tracking, no screenshots, no breadcrumbs (they
// could hold what was typed or shown). Before anything is sent, the user and request details are
// removed and email addresses, phone numbers and sign-in tokens in the remaining text are
// replaced. Farmers' photos are never attached.
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Kenyan numbers as farmers type them: 07..., 01..., +254..., 254... (spaces or dashes allowed)
const PHONE = /(?:\+?254|0)[17](?:[\s-]?\d){8}/g;
// Access and refresh tokens (JWT) and "Bearer ..." headers that end up in an error message.
const TOKEN = /\bBearer\s+[\w.-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

export function scrubText(value) {
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
export function beforeSend(event) {
    delete event.user;
    delete event.request;
    delete event.breadcrumbs;
    for (const key of ['message', 'logentry', 'exception', 'extra', 'contexts', 'tags']) {
        if (key in event) event[key] = scrub(event[key]);
    }
    return event;
}

/** Start Sentry when the app was built with a DSN; returns whether it is on. */
export function initMonitoring() {
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
