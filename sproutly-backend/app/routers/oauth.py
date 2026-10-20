"""Continue with Google: OAuth 2.0 sign-in run by the backend.

1. The app makes a random PKCE verifier, keeps it, and opens the browser at
   /start with the verifier's hash (code_challenge) and its own return link.
2. /start records the attempt and sends the browser to Google's sign-in page.
3. Google sends the browser back to /callback with a code and our `state`.
   The backend swaps the code for the user's Google identity, finds or creates
   the account, and sends the browser back to the app with a one-time login code.
4. The app posts that code with its verifier to /exchange and gets its tokens.

Tokens never travel in a link, and a stolen login code is useless without the
verifier that only the app that started the sign-in holds.
"""

import hmac
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core import oauth
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import create_mfa_token, hash_token, new_url_token, pkce_challenge
from app.db.session import get_db
from app.models.oauth_flow import OAuthFlow
from app.models.user import User, UserRole
from app.routers.auth import issue_tokens
from app.schemas.auth import MfaChallengeResponse, OAuthExchangeRequest, OAuthLoginResponse

router = APIRouter(prefix="/auth/oauth", tags=["auth"])

# The app swaps the login code straight away; a short life limits a leaked one.
LOGIN_CODE_MINUTES = 2
PROVIDER_ID_COLUMNS = {"google": "google_id"}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _back_to_app(flow: OAuthFlow, **params: str) -> RedirectResponse:
    separator = "&" if "?" in flow.app_redirect_uri else "?"
    return RedirectResponse(flow.app_redirect_uri + separator + urlencode(params), status_code=status.HTTP_302_FOUND)


def _expired_page() -> HTMLResponse:
    return HTMLResponse(
        "<p style='font-family:sans-serif'>This sign-in has expired. Go back to the app and try again.</p>",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


def _find_or_create_user(db: Session, identity: oauth.Identity) -> User:
    column = PROVIDER_ID_COLUMNS[identity.provider]
    user = db.query(User).filter(getattr(User, column) == identity.subject).first()
    if user:
        return user

    if identity.email:
        # Link to an existing account only through an email the provider has verified;
        # otherwise anyone could add a victim's address to a new provider account and take over.
        user = db.query(User).filter(User.user_email == identity.email).first()
        if user:
            # Staff sign in only with a password and their authenticator. Linking would remove
            # both (below) and let a Google account into the admin portal.
            if user.role != UserRole.farmer:
                raise oauth.OAuthError("staff_account")
            if getattr(user, column) is not None:
                raise oauth.OAuthError("account_conflict")
            setattr(user, column, identity.subject)
            # Pre-hijacking defence (Sudhodanan & Paverd, 2022): nothing proved that whoever
            # set this account's password or authenticator owned the email, so someone could
            # have registered the victim's address in advance. The provider has now proved who
            # owns it; credentials set before that proof are removed. Email accounts sign in
            # with the provider from here on.
            user.hashed_password = None
            user.totp_secret_encrypted = None
            user.totp_last_used_step = None
            user.mfa_enabled = False
            user.is_verified = True
            db.commit()
            return user

    user = User(user_email=identity.email, is_verified=True)
    setattr(user, column, identity.subject)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{provider}/start")
@limiter.limit("10/minute")
def start(request: Request, provider: str, redirect_uri: str, code_challenge: str, db: Session = Depends(get_db)):
    if not oauth.is_configured(provider):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown sign-in option")
    # Only the app's own links: the login code must never be sent to an outside website.
    if not any(redirect_uri.startswith(prefix) for prefix in settings.oauth_app_redirect_prefixes):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Return link not allowed")
    if len(code_challenge) != 43:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_challenge must be an S256 PKCE challenge")

    # Housekeeping: attempts older than a day are no longer needed.
    db.query(OAuthFlow).filter(OAuthFlow.expires_at < _now() - timedelta(days=1)).delete()

    verifier = new_url_token()
    flow = OAuthFlow(
        state=new_url_token(),
        provider=provider,
        app_redirect_uri=redirect_uri,
        app_code_challenge=code_challenge,
        provider_code_verifier=verifier,
        expires_at=_now() + timedelta(minutes=settings.oauth_flow_expire_minutes),
    )
    db.add(flow)
    db.commit()
    redirect_uri = oauth.callback_url(provider, str(request.base_url))
    return RedirectResponse(
        oauth.authorization_url(provider, flow.state, pkce_challenge(verifier), redirect_uri),
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/{provider}/callback")
def callback(
    request: Request,
    provider: str,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    flow = db.get(OAuthFlow, state) if state else None
    # Each attempt can come back only once, within its time, from the provider it went to.
    if not flow or flow.provider != provider or flow.user_id is not None or flow.used or flow.expires_at < _now():
        return _expired_page()

    if error or not code:
        # The user pressed Cancel on the provider's page.
        flow.used = True
        db.commit()
        return _back_to_app(flow, error="cancelled")

    try:
        # The browser arrived here through the registered callback address, so this request's
        # own address rebuilds exactly the redirect_uri that was sent to the provider.
        identity = oauth.fetch_identity(provider, code, flow.provider_code_verifier,
                                        oauth.callback_url(provider, str(request.base_url)))
        user = _find_or_create_user(db, identity)
    except oauth.OAuthError as exc:
        flow.used = True
        db.commit()
        return _back_to_app(flow, error="account_conflict" if str(exc) == "account_conflict" else "failed")

    if not user.is_active:
        flow.used = True
        db.commit()
        return _back_to_app(flow, error="failed")

    login_code = new_url_token()
    flow.user_id = user.user_id
    flow.login_code_hash = hash_token(login_code)
    flow.login_code_expires_at = _now() + timedelta(minutes=LOGIN_CODE_MINUTES)
    db.commit()
    return _back_to_app(flow, code=login_code)


@router.post("/exchange", response_model=OAuthLoginResponse)
@limiter.limit("10/minute")
def exchange(request: Request, payload: OAuthExchangeRequest, db: Session = Depends(get_db)):
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This sign-in has expired. Please try again.")
    flow = db.query(OAuthFlow).filter(OAuthFlow.login_code_hash == hash_token(payload.code)).first()
    if not flow or flow.used or flow.login_code_expires_at < _now():
        raise invalid
    if not hmac.compare_digest(pkce_challenge(payload.code_verifier), flow.app_code_challenge):
        raise invalid

    flow.used = True  # one exchange per code
    db.commit()
    user = db.get(User, flow.user_id)
    # Google sign-in is for farmers only (see _find_or_create_user).
    if not user or not user.is_active or user.role != UserRole.farmer:
        raise invalid

    # A Google login on an account that has MFA on still asks for the authenticator code.
    # (Accounts linked by email lose their old authenticator above, so this applies to
    # accounts that set one up after linking.)
    if user.mfa_enabled:
        minutes = settings.mfa_token_expire_minutes
        return OAuthLoginResponse(challenge=MfaChallengeResponse(
            next_step="verify",
            mfa_token=create_mfa_token(str(user.user_id), "mfa_login", minutes),
            expires_in_minutes=minutes,
        ))
    return OAuthLoginResponse(tokens=issue_tokens(user))


@router.get("/providers")
def providers():
    """Which sign-in buttons the app should show."""
    return {"providers": [p for p in PROVIDER_ID_COLUMNS if oauth.is_configured(p)]}
