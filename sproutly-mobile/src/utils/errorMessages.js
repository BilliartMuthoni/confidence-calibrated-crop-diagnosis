// Turns technical failures into something a farmer can act on.
// Every message should answer: what happened, and what do I do now?

const PATTERNS = [
    {
        match: /network error|econnaborted|timed out|timeout/i,
        title: "Can't reach Sproutly",
        message: 'Check that you have internet, then try again.',
        retryable: true,
    },
    {
        match: /invalid credentials/i,
        title: 'That did not match',
        message: 'The phone number or password is wrong. Check them and try again.',
        retryable: false,
    },
    {
        match: /already exists/i,
        title: 'Account already exists',
        // Also shown for email sign-ups, and for a sign-up left before the authenticator step:
        // logging in with the same password goes straight back to that step.
        message: "It's already registered. Log in instead. If you didn't finish setting up, logging in takes you back to that step.",
        retryable: false,
    },
    {
        match: /rate limit|too many/i,
        title: 'Too many tries',
        message: 'Wait a minute before trying again.',
        retryable: false,
    },
    {
        match: /wrong or expired code/i,
        title: 'That code did not work',
        message: 'The code changes every 30 seconds. Enter the one showing now in your authenticator app.',
        retryable: false,
    },
    {
        match: /code must be the 6 digits/i,
        title: 'Enter all 6 digits',
        message: 'Type the 6-digit code shown under Sproutly in your authenticator app.',
        retryable: false,
    },
    {
        match: /oauth account_conflict/i,
        title: 'Already linked elsewhere',
        message: 'This email is already linked to a different account on that service. Sign in with that one instead.',
        retryable: false,
    },
    {
        match: /^oauth |sign-in has expired/i,
        title: 'Sign-in did not finish',
        message: 'Something went wrong while signing in. Please try again.',
        retryable: true,
    },
    {
        match: /step has expired/i,
        title: 'This took too long',
        message: 'For your security, go back and log in again.',
        retryable: false,
    },
    {
        match: /not a jpeg|could not be read|dimensions are too large|file is empty/i,
        title: 'That photo would not work',
        message: 'Take the photo again with your camera and try once more.',
        retryable: false,
    },
    {
        match: /too large/i,
        title: 'Photo is too big',
        message: 'Take a new photo with the camera instead of using a large saved file.',
        retryable: false,
    },
    {
        match: /not authenticated|401/i,
        title: 'Please log in again',
        message: 'Your session has ended for security. Log in to continue.',
        retryable: false,
    },
];

export function toFriendlyError(error) {
    const raw = typeof error === 'string' ? error : error?.message || '';

    for (const entry of PATTERNS) {
        if (entry.match.test(raw)) {
            return { title: entry.title, message: entry.message, retryable: entry.retryable };
        }
    }

    return {
        title: 'Something went wrong',
        message: raw || 'Please try again in a moment.',
        retryable: true,
    };
}
