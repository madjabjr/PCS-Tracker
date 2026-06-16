from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from urllib.parse import urlencode
import secrets
import httpx

from ..database import get_db
from ..models import ChecklistTask, User
from ..schemas import ChecklistTaskResponse
from ..auth.dependencies import get_current_user
from ..config import settings
from ..gcal_sync import get_valid_token, ensure_pcs_calendar

router = APIRouter()

GCAL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GCAL_TOKEN_URL = "https://oauth2.googleapis.com/token"
# Full calendar access required to create the PCS Tracker calendar and write events
GCAL_SCOPE = "https://www.googleapis.com/auth/calendar"

_PCS_MARKER = "pcs_tracker_app"


@router.get("/connect")
async def calendar_connect(
    request: Request,
    _: User = Depends(get_current_user),
):
    state = secrets.token_urlsafe(32)
    for key in list(request.session.keys()):
        if key.startswith("_state_"):
            del request.session[key]
    request.session["gcal_oauth_state"] = state

    redirect_uri = f"{settings.backend_url}/api/calendar/connect/callback"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GCAL_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return RedirectResponse(url=f"{GCAL_AUTH_URL}?{urlencode(params)}")


@router.get("/connect/callback")
async def calendar_connect_callback(
    request: Request,
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if error:
        return RedirectResponse(url=f"{settings.frontend_url}/calendar?gcal_error={error}")

    stored_state = request.session.pop("gcal_oauth_state", None)
    if not code or not state or state != stored_state:
        return RedirectResponse(url=f"{settings.frontend_url}/calendar?gcal_error=state_mismatch")

    redirect_uri = f"{settings.backend_url}/api/calendar/connect/callback"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GCAL_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=10.0,
            )
        if resp.status_code != 200:
            return RedirectResponse(url=f"{settings.frontend_url}/calendar?gcal_error=token_exchange_failed")
        token_data = resp.json()
    except Exception:
        return RedirectResponse(url=f"{settings.frontend_url}/calendar?gcal_error=network_error")

    current_user.google_access_token = token_data.get("access_token")
    if token_data.get("refresh_token"):
        current_user.google_refresh_token = token_data["refresh_token"]
    expires_in = token_data.get("expires_in", 3600)
    current_user.google_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
    await db.commit()

    # Find or create the dedicated PCS Tracker calendar
    await ensure_pcs_calendar(current_user, db)

    return RedirectResponse(url=f"{settings.frontend_url}/calendar?gcal_connected=1")


@router.post("/disconnect")
async def calendar_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    current_user.google_token_expiry = None
    current_user.pcs_calendar_id = None
    await db.commit()
    return {"disconnected": True}


@router.get("/tasks", response_model=list[ChecklistTaskResponse])
async def get_tasks_with_dates(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChecklistTask).where(ChecklistTask.due_date.isnot(None))
    )
    return result.scalars().all()


@router.get("/google-events")
async def get_pcs_calendar_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    time_min: str = Query(default=None),
    time_max: str = Query(default=None),
):
    """Return events from the dedicated PCS Tracker Google Calendar (not the primary calendar).
    Excludes events synced by this app (tasks/flights) to avoid duplicate display.
    """
    if not current_user.google_access_token:
        return {"events": [], "connected": False}

    token = await get_valid_token(current_user, db)
    if not token:
        return {"events": [], "connected": False, "error": "Token refresh failed — please reconnect"}

    # Ensure the PCS calendar exists; create it if missing
    if not current_user.pcs_calendar_id:
        cal_id = await ensure_pcs_calendar(current_user, db)
        if not cal_id:
            return {
                "events": [],
                "connected": True,
                "error": "Could not find or create PCS Tracker calendar — please reconnect with updated permissions",
                "needs_reconnect": True,
            }

    cal_id = current_user.pcs_calendar_id

    now = datetime.utcnow()
    t_min = time_min or now.isoformat() + "Z"
    t_max = time_max or (now + timedelta(days=90)).isoformat() + "Z"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "timeMin": t_min,
                    "timeMax": t_max,
                    "singleEvents": True,
                    "orderBy": "startTime",
                    "maxResults": 500,
                    "privateExtendedProperty": f"{_PCS_MARKER}!exists",
                },
                timeout=10.0,
            )

        if resp.status_code == 401:
            token = await get_valid_token(current_user, db)
            if not token:
                return {"events": [], "connected": False, "error": "Unauthorized — please reconnect"}
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
                    headers={"Authorization": f"Bearer {token}"},
                    params={
                        "timeMin": t_min,
                        "timeMax": t_max,
                        "singleEvents": True,
                        "orderBy": "startTime",
                        "maxResults": 500,
                        "privateExtendedProperty": f"{_PCS_MARKER}!exists",
                    },
                    timeout=10.0,
                )

        if resp.status_code == 404:
            # Calendar was deleted externally — clear stored ID and recreate
            current_user.pcs_calendar_id = None
            await db.commit()
            return {"events": [], "connected": True, "error": "PCS Tracker calendar not found — reconnect to recreate it"}

        if resp.status_code != 200:
            return {"events": [], "connected": True, "error": f"Google API error: {resp.status_code}"}

        events = []
        for item in resp.json().get("items", []):
            # Skip events synced from this app (tasks/flights) — they're already shown via DB
            ext = item.get("extendedProperties", {}).get("private", {})
            if ext.get(_PCS_MARKER):
                continue
            start = item.get("start", {})
            end = item.get("end", {})
            events.append({
                "id": item.get("id"),
                "title": item.get("summary", "(No title)"),
                "start": start.get("dateTime") or start.get("date"),
                "end": end.get("dateTime") or end.get("date"),
                "all_day": "date" in start and "dateTime" not in start,
                "html_link": item.get("htmlLink"),
            })

        return {"events": events, "connected": True}

    except Exception as e:
        return {"events": [], "connected": True, "error": str(e)}


@router.get("/primary-conflicts")
async def get_primary_calendar_conflicts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    time_min: str = Query(...),
    time_max: str = Query(...),
):
    """Read-only fetch of the user's primary Google Calendar for conflict detection.
    Returns events in the given date range to cross-reference against PCS dates.
    """
    if not current_user.google_access_token:
        return {"events": [], "connected": False}

    token = await get_valid_token(current_user, db)
    if not token:
        return {"events": [], "connected": False}

    try:
        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": True,
            "orderBy": "startTime",
            "maxResults": 500,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=10.0,
            )

        if resp.status_code == 401:
            token = await get_valid_token(current_user, db)
            if not token:
                return {"events": [], "connected": False}
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    headers={"Authorization": f"Bearer {token}"},
                    params=params,
                    timeout=10.0,
                )

        if resp.status_code != 200:
            return {"events": [], "connected": True}

        events = []
        for item in resp.json().get("items", []):
            start = item.get("start", {})
            end = item.get("end", {})
            events.append({
                "id": item.get("id"),
                "title": item.get("summary", "(No title)"),
                "start": start.get("dateTime") or start.get("date"),
                "end": end.get("dateTime") or end.get("date"),
                "all_day": "date" in start and "dateTime" not in start,
            })

        return {"events": events, "connected": True}

    except Exception:
        return {"events": [], "connected": True}
