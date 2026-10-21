from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise unauthorized

    user_id = payload.get("sub")
    if not user_id:
        raise unauthorized

    user = db.query(User).filter(User.user_id == int(user_id)).first()
    if not user or not user.is_active:
        raise unauthorized

    return user


def get_token_claims(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    """The claims of the request's access token (use together with get_current_user, which
    checks it), e.g. auth_time: when the person last signed in rather than renewed."""
    payload = decode_token(credentials.credentials) if credentials else None
    return payload or {}


def require_role(*allowed_roles: UserRole):
    """Guard a route so only the given roles may call it."""

    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _check
