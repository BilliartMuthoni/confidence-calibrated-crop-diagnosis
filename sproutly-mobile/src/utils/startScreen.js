// Which sign-in screen opens after signing out. A normal log out opens Log in (the farmer still
// has an account); after deleting the account it is Get Started, since there is nothing to log in
// to any more (found in usability testing). Kept in memory only: a fresh app start always
// begins at Get Started anyway.
let afterDeletion = false;

/** Call just before signing out after a deletion. */
export function startAtGetStarted() {
    afterDeletion = true;
}

export function startsAtGetStarted() {
    return afterDeletion;
}

/** A new sign-in: the next log out opens Log in again. */
export function resetStartScreen() {
    afterDeletion = false;
}
