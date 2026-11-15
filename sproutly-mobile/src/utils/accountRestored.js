import { showDialog } from '../components/Dialog';
import { restoreAccount } from '../api/AuthService';
import { toFriendlyError } from './errorMessages';

function dateLabel(value) {
    // The server sends plain UTC without a zone.
    const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The last step of every sign-in. An account waiting to be deleted (grace period) does not go
 * straight in: like Instagram and Facebook, the farmer chooses to keep it or let the deletion go
 * ahead. Returns false when no session was started.
 */
export async function finishSignIn(tokens, login, roles, onDecline) {
    if (!tokens?.delete_after) {
        await login(tokens.access_token, roles || [tokens.role], tokens.refresh_token);
        return true;
    }
    const keep = async () => {
        try {
            const fresh = await restoreAccount({ token: tokens.access_token });
            await login(fresh.access_token, roles || [fresh.role], fresh.refresh_token);
            showDialog('Account kept', 'Your account will not be deleted. Your checks are still here.');
        } catch (e) {
            const error = toFriendlyError(e);
            showDialog(error.title, error.message);
        }
    };
    showDialog(
        'Your account is being deleted',
        `It will be deleted for good on ${dateLabel(tokens.delete_after)}. Do you want to keep it?`,
        [
            { text: 'Keep my account', onPress: keep },
            { text: 'Continue deletion', style: 'cancel', onPress: onDecline },
        ]
    );
    return false;
}
