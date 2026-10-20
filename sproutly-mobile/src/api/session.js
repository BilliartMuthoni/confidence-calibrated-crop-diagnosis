// Lets the API clients renew an expired sign-in, or tell the app that it has ended.
//
// When the backend rejects a request that carried a token (HTTP 401), the access token has
// usually just run out (it lasts 15 minutes): the app swaps its refresh token for a new pair
// and sends the same request again, so the farmer notices nothing. Only when that fails too
// (the refresh token is older than 7 days, was used on another phone, or the farmer logged
// out elsewhere) does the app log out and return to the login screen.
import { renewSession } from './tokens';

let handleExpired = null;

export function onSessionExpired(handler) {
    handleExpired = handler;
}

function setAuthorization(config, token) {
    if (typeof config.headers?.set === 'function') config.headers.set('Authorization', `Bearer ${token}`);
    else config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
}

export function watchForExpiredSession(client) {
    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            const config = error?.config;
            const headers = config?.headers;
            const sentToken = Boolean(headers?.Authorization || headers?.get?.('Authorization'));
            // A 401 without a token (e.g. a wrong password at login) is not an expired session.
            if (error?.response?.status !== 401 || !sentToken || !config) return Promise.reject(error);
            if (!config._renewed) {
                let fresh;
                try {
                    fresh = await renewSession();
                } catch {
                    return Promise.reject(error); // no signal: keep the farmer signed in, show the error
                }
                if (fresh) {
                    config._renewed = true; // one retry only
                    setAuthorization(config, fresh);
                    return client(config);
                }
            }
            handleExpired?.();
            return Promise.reject(error);
        }
    );
}
