import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_DAYS, REFRESH_TOKEN_DAYS
from .db import get_db
from .models import AuthToken, User

bearer = HTTPBearer(auto_error=False)


def _issue_token(db: Session, user_id: str, token_type: str, days: int) -> str:
    token = f"{'at' if token_type == 'access' else 'rt'}_{secrets.token_hex(24)}"
    db.add(
        AuthToken(
            id=f"tok_{secrets.token_hex(8)}",
            user_id=user_id,
            token=token,
            type=token_type,
            expires_at=datetime.now(timezone.utc) + timedelta(days=days),
        )
    )
    db.commit()
    return token


def issue_session(db: Session, user: User) -> dict:
    """Create access + refresh tokens for a user (PRD §14)."""
    access = _issue_token(db, user.id, "access", ACCESS_TOKEN_DAYS)
    refresh = _issue_token(db, user.id, "refresh", REFRESH_TOKEN_DAYS)
    return {"accessToken": access, "refreshToken": refresh}


def revoke_tokens(db: Session, user_id: str) -> None:
    tokens = db.scalars(select(AuthToken).where(AuthToken.user_id == user_id)).all()
    for t in tokens:
        db.delete(t)
    db.commit()


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = db.scalar(
        select(AuthToken).where(
            AuthToken.token == creds.credentials, AuthToken.type == "access"
        )
    )
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    if token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Token expired")
    user = db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != "OWNER":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user
