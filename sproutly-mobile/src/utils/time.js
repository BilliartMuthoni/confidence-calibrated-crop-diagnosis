// Times from the API are UTC without a zone marker; read them as UTC, then show them in the
// phone's own time zone.
export function parseUtc(value) {
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

const clock = (date) => date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** "Wednesday 29 October 2026, 14:05": the date shown on a past result. */
export function fullDateLabel(value) {
    const date = parseUtc(value);
    return `${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${clock(date)}`;
}

/** Start of this week (Monday) and of this month, in the phone's time zone, for the history filters. */
export function startOfWeek() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
}

export function startOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** "Today, 12:08", "Yesterday, 18:40", or "17 Oct, 09:15": the actual time, not "x ago". */
export function whenLabel(value) {
    const date = parseUtc(value);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    if (date >= startOfToday) return `Today, ${clock(date)}`;
    if (date >= startOfYesterday) return `Yesterday, ${clock(date)}`;
    return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${clock(date)}`;
}
