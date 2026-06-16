from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
import bcrypt as _bcrypt
from datetime import datetime, timedelta

from ..database import get_db
from ..models import User, WhitelistedEmail
from ..schemas import LocalLoginRequest, AuthResponse, UserResponse
from ..config import settings
from ..auth.jwt import create_access_token
from ..auth.dependencies import get_current_user

router = APIRouter()

def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.access_token_expire_hours * 3600,
    )


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = f"{settings.backend_url}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth authentication failed")

    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not retrieve user info from Google")

    email = user_info["email"].lower().strip()

    wl_result = await db.execute(select(WhitelistedEmail).where(WhitelistedEmail.email == email))
    wl_entry = wl_result.scalar_one_or_none()
    if not wl_entry:
        return RedirectResponse(url=f"{settings.frontend_url}/login?error=not_whitelisted")

    result = await db.execute(select(User).where(User.google_id == user_info["sub"]))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    access_token_val = token.get("access_token")
    refresh_token_val = token.get("refresh_token")
    expires_in = token.get("expires_in", 3600)
    token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    if not user:
        user = User(
            email=email,
            name=user_info.get("name"),
            picture=user_info.get("picture"),
            google_id=user_info["sub"],
            is_admin=(wl_entry.role == "admin"),
            auth_provider="google",
            google_access_token=access_token_val,
            google_refresh_token=refresh_token_val,
            google_token_expiry=token_expiry,
        )
        db.add(user)
    else:
        user.google_id = user_info["sub"]
        user.name = user_info.get("name", user.name)
        user.picture = user_info.get("picture", user.picture)
        user.is_admin = (wl_entry.role == "admin")
        user.last_login = datetime.utcnow()
        user.google_access_token = access_token_val
        if refresh_token_val:
            user.google_refresh_token = refresh_token_val
        user.google_token_expiry = token_expiry

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    response = RedirectResponse(url=settings.frontend_url)
    _set_auth_cookie(response, access_token)
    return response


@router.post("/local/login", response_model=AuthResponse)
async def local_login(
    credentials: LocalLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if credentials.username != settings.admin_username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not _verify_password(credentials.password, settings.admin_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    local_email = f"{settings.admin_username}@local"
    result = await db.execute(select(User).where(User.email == local_email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=local_email,
            name="Local Admin",
            is_admin=True,
            auth_provider="local",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    user.last_login = datetime.utcnow()
    await db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    _set_auth_cookie(response, access_token)

    return AuthResponse(user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "Logged out"}
