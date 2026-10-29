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
        // Password login on an account made with Google: there is no Sproutly password yet.
        match: /signs in with google/i,
        title: 'This account uses Google',
        message: 'Tap Continue with Google below. To also log in with a password, go to Sign up with this email.',
        retryable: false,
    },
    {
        // Email sign-up on an account made with Google.
        match: /account with google/i,
        title: 'You already have an account',
        message: "It was made with Google. Tap Continue with Google below to confirm it's you, and your password will be added.",
        retryable: false,
    },
    {
        match: /not the one for this email/i,
        title: 'Different Google account',
        message: 'Tap Continue with Google again and choose the Google account with the email you typed.',
        retryable: false,
    },
    {
        match: /current password is not right/i,
        title: 'That password is not right',
        message: 'Type the password you use to log in to Sproutly now.',
        retryable: false,
    },
    {
        match: /password is not right/i,
        title: 'That password is not right',
        message: 'Enter your Sproutly password, not your Google password.',
        retryable: false,
    },
    {
        match: /backup code is wrong or already used/i,
        title: 'That backup code did not work',
        message: 'Check the digits, or try another of your codes: each one works only once.',
        retryable: false,
    },
    {
        // Changing the phone or email of an account made with Google.
        match: /continue with google again, then change it/i,
        title: 'Confirm with Google first',
        message: 'Tap the button to continue with Google, then your change is saved.',
        retryable: false,
    },
    {
        match: /already belongs to another account/i,
        title: 'Already in use',
        message: 'Another Sproutly account uses that. Check it, or keep your current one.',
        retryable: false,
    },
    {
        match: /email comes from google/i,
        title: 'Your email comes from Google',
        message: 'To change it, disconnect Google in Account first.',
        retryable: false,
    },
    {
        match: /keep a phone number or an email/i,
        title: 'Keep one way to log in',
        message: 'Leave a phone number or an email filled in.',
        retryable: false,
    },
    {
        match: /enter the phone number like/i,
        title: 'Check the phone number',
        message: 'Enter it like 0712345678.',
        retryable: false,
    },
    {
        match: /valid email|not a valid email|email address/i,
        title: 'Check the email',
        message: 'Enter it like you@example.com.',
        retryable: false,
    },
    {
        match: /nothing was changed/i,
        title: 'Nothing to save',
        message: 'Change the phone number or email first.',
        retryable: false,
    },
    {
        match: /continue with google again/i,
        title: 'Confirm with Google first',
        message: 'For your safety, tap the button to continue with Google, then your account is deleted.',
        retryable: false,
    },
    {
        match: /already linked to another sproutly account/i,
        title: 'Google already in use',
        message: 'That Google account already opens a different Sproutly account. Log in with that one instead.',
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
        // The account lockout, not the per-minute limit.
        match: /too many wrong attempts/i,
        title: 'Account paused',
        message: 'There were too many wrong tries, so this account is paused for a few minutes. Try again later.',
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
        match: /oauth google_in_use/i,
        title: 'Google already in use',
        message: 'That Google account already opens a different Sproutly account. Choose another Google account.',
        retryable: false,
    },
    {
        match: /oauth account_conflict/i,
        title: 'Already linked elsewhere',
        message: 'This email is already linked to a different account on that service. Sign in with that one instead.',
        retryable: false,
    },
    {
        match: /oauth staff_account/i,
        title: 'Staff log in with a password',
        message: 'Officer and admin accounts use their password and authenticator, not Google.',
        retryable: false,
    },
    {
        // A server where Google sign-in isn't set up.
        match: /unknown sign-in option/i,
        title: 'Google sign-in is not available',
        message: 'Log in with your phone number or email and your password instead.',
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
        match: /look like a leaf/i,
        title: 'This is not a leaf photo',
        message: 'Take a close-up of one maize, tomato or potato leaf.',
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
