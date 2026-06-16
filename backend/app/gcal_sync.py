"""Google Calendar sync helpers for the PCS Tracker dedicated calendar."""
from datetime import datetime, timedelta
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

PCS_CALENDAR_NAME = "PCS Tracker"
_PCS_MARKER = "pcs_tracker_app"


async def get_valid_token(user, db: AsyncSession) -> str | None:
    """Return a valid Google access token, refreshing if it expires in < 5 min."""
    if not user.google_access_token:
        return None
    if user.google_token_expiry and user.google_token_expiry < datetime.utcnow() + timedelta(minutes=5):
        from .config import settings
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "refresh_token": user.google_refresh_token,
                        "grant_type": "refresh_token",
                    },
                    timeout=10.0,
                )
            if resp.status_code == 200:
                data = resp.json()
                user.google_access_token = data["access_token"]
                user.google_token_expiry = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
                await db.commit()
            else:
                return None
        except Exception:
            return None
    return user.google_access_token


async def ensure_pcs_calendar(user, db: AsyncSession) -> str | None:
    """Find the 'PCS Tracker' Google Calendar or create it. Stores ID on user."""
    token = await get_valid_token(user, db)
    if not token:
        return None

    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers=headers,
                timeout=10.0,
            )
        if resp.status_code != 200:
            return None

        for cal in resp.json().get("items", []):
            if cal.get("summary") == PCS_CALENDAR_NAME:
                user.pcs_calendar_id = cal["id"]
                await db.commit()
                return cal["id"]

        # Calendar not found — create it
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.googleapis.com/calendar/v3/calendars",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "summary": PCS_CALENDAR_NAME,
                    "description": "Managed by PCS Tracker — military Permanent Change of Station move planner.",
                    "timeZone": "UTC",
                },
                timeout=10.0,
            )
        if resp.status_code in (200, 201):
            cal_id = resp.json()["id"]
            user.pcs_calendar_id = cal_id
            await db.commit()
            return cal_id
    except Exception:
        pass
    return None


def _task_event_body(task) -> dict:
    due = task.due_date
    date_str = due.strftime("%Y-%m-%d")
    return {
        "summary": f"[PCS] {task.title}",
        "description": f"PCS Tracker task — Category: {task.category}",
        "start": {"date": date_str},
        "end": {"date": date_str},
        "extendedProperties": {
            "private": {_PCS_MARKER: "task", "pcs_task_id": str(task.id)}
        },
    }


async def sync_task_to_gcal(task, user, db: AsyncSession) -> None:
    """Create or update the GCal event for a checklist task. Best-effort; never raises."""
    if not task.due_date or not user.pcs_calendar_id:
        return
    token = await get_valid_token(user, db)
    if not token:
        return

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    cal_id = user.pcs_calendar_id
    body = _task_event_body(task)

    try:
        async with httpx.AsyncClient() as client:
            if task.gcal_event_id:
                url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{task.gcal_event_id}"
                resp = await client.put(url, headers=headers, json=body, timeout=10.0)
                if resp.status_code == 404:
                    task.gcal_event_id = None
                elif resp.status_code in (200, 201):
                    return
            if not task.gcal_event_id:
                url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events"
                resp = await client.post(url, headers=headers, json=body, timeout=10.0)
                if resp.status_code in (200, 201):
                    task.gcal_event_id = resp.json()["id"]
                    await db.commit()
    except Exception:
        pass


async def delete_task_from_gcal(task, user, db: AsyncSession) -> None:
    """Delete the GCal event for a checklist task. Best-effort; never raises."""
    if not task.gcal_event_id or not user.pcs_calendar_id:
        return
    token = await get_valid_token(user, db)
    if not token:
        return

    try:
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"https://www.googleapis.com/calendar/v3/calendars/{user.pcs_calendar_id}/events/{task.gcal_event_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
    except Exception:
        pass


async def sync_flight_to_gcal(itinerary, user, db: AsyncSession) -> None:
    """Create or update GCal events for a flight itinerary. Best-effort; never raises."""
    if not user.pcs_calendar_id:
        return
    token = await get_valid_token(user, db)
    if not token:
        return

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    cal_id = user.pcs_calendar_id
    route = f"{itinerary.departure_airport or '?'} → {itinerary.arrival_airport or '?'}"
    changed = False

    async def _upsert(body: dict, existing_id: str | None) -> str | None:
        try:
            async with httpx.AsyncClient() as client:
                if existing_id:
                    url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{existing_id}"
                    resp = await client.put(url, headers=headers, json=body, timeout=10.0)
                    if resp.status_code in (200, 201):
                        return existing_id
                    if resp.status_code != 404:
                        return existing_id
                url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events"
                resp = await client.post(url, headers=headers, json=body, timeout=10.0)
                if resp.status_code in (200, 201):
                    return resp.json()["id"]
        except Exception:
            pass
        return existing_id

    if itinerary.departure_time:
        try:
            dep_dt = datetime.fromisoformat(itinerary.departure_time.rstrip("Z"))
            body = {
                "summary": f"✈ Flight {itinerary.flight_number} Departs",
                "description": f"PCS Tracker — {route}",
                "start": {"dateTime": dep_dt.isoformat() + "Z"},
                "end": {"dateTime": (dep_dt + timedelta(minutes=30)).isoformat() + "Z"},
                "extendedProperties": {
                    "private": {_PCS_MARKER: "flight_dep", "pcs_itin_id": str(itinerary.id)}
                },
            }
            new_id = await _upsert(body, itinerary.gcal_dep_event_id)
            if new_id != itinerary.gcal_dep_event_id:
                itinerary.gcal_dep_event_id = new_id
                changed = True
        except Exception:
            pass

    if itinerary.arrival_time:
        try:
            arr_dt = datetime.fromisoformat(itinerary.arrival_time.rstrip("Z"))
            body = {
                "summary": f"✈ Flight {itinerary.flight_number} Lands",
                "description": f"PCS Tracker — {route}",
                "start": {"dateTime": arr_dt.isoformat() + "Z"},
                "end": {"dateTime": (arr_dt + timedelta(minutes=30)).isoformat() + "Z"},
                "extendedProperties": {
                    "private": {_PCS_MARKER: "flight_arr", "pcs_itin_id": str(itinerary.id)}
                },
            }
            new_id = await _upsert(body, itinerary.gcal_arr_event_id)
            if new_id != itinerary.gcal_arr_event_id:
                itinerary.gcal_arr_event_id = new_id
                changed = True
        except Exception:
            pass

    if changed:
        await db.commit()


async def delete_flight_from_gcal(itinerary, user, db: AsyncSession) -> None:
    """Delete GCal events for a flight itinerary. Best-effort; never raises."""
    if not user.pcs_calendar_id:
        return
    token = await get_valid_token(user, db)
    if not token:
        return

    headers = {"Authorization": f"Bearer {token}"}
    for event_id in filter(None, [itinerary.gcal_dep_event_id, itinerary.gcal_arr_event_id]):
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"https://www.googleapis.com/calendar/v3/calendars/{user.pcs_calendar_id}/events/{event_id}",
                    headers=headers,
                    timeout=10.0,
                )
        except Exception:
            pass
