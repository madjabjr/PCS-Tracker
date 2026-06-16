from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from ..database import get_db
from ..models import FlightItinerary, User
from ..schemas import FlightItineraryCreate, FlightItineraryResponse
from ..auth.dependencies import get_current_user
from ..config import settings

router = APIRouter()


@router.get("/flight/{flight_number}")
async def lookup_flight(
    flight_number: str,
    _: User = Depends(get_current_user),
):
    if not settings.aviationstack_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Flight lookup requires AVIATIONSTACK_API_KEY in backend/.env",
        )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "http://api.aviationstack.com/v1/flights",
                params={
                    "access_key": settings.aviationstack_api_key,
                    "flight_iata": flight_number.upper(),
                },
                timeout=12.0,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Flight API timed out")

    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Flight API error")

    data = resp.json()

    if "error" in data:
        err = data["error"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err.get("message", "Flight API returned an error"),
        )

    flights = data.get("data", [])
    if not flights:
        return {"flights": [], "found": False}

    results = []
    for f in flights[:5]:
        dep = f.get("departure", {})
        arr = f.get("arrival", {})
        airline = f.get("airline", {})
        flight_info = f.get("flight", {})
        results.append({
            "flight_iata": flight_info.get("iata") or flight_number.upper(),
            "airline_name": airline.get("name"),
            "status": f.get("flight_status", "unknown"),
            "flight_date": f.get("flight_date"),
            "departure": {
                "airport": dep.get("airport"),
                "iata": dep.get("iata"),
                "scheduled": dep.get("scheduled"),
                "estimated": dep.get("estimated"),
                "actual": dep.get("actual"),
                "terminal": dep.get("terminal"),
                "gate": dep.get("gate"),
                "delay": dep.get("delay"),
            },
            "arrival": {
                "airport": arr.get("airport"),
                "iata": arr.get("iata"),
                "scheduled": arr.get("scheduled"),
                "estimated": arr.get("estimated"),
                "actual": arr.get("actual"),
                "terminal": arr.get("terminal"),
                "gate": arr.get("gate"),
                "delay": arr.get("delay"),
            },
        })

    return {"flights": results, "found": True}


@router.get("/itineraries", response_model=list[FlightItineraryResponse])
async def list_itineraries(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FlightItinerary).order_by(FlightItinerary.created_at.desc())
    )
    return result.scalars().all()


@router.post("/itineraries", response_model=FlightItineraryResponse, status_code=201)
async def create_itinerary(
    body: FlightItineraryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    itinerary = FlightItinerary(
        flight_number=body.flight_number.upper(),
        flight_date=body.flight_date,
        departure_airport=body.departure_airport,
        arrival_airport=body.arrival_airport,
        departure_time=body.departure_time,
        arrival_time=body.arrival_time,
        airline=body.airline,
        notes=body.notes,
        created_by_email=current_user.email,
    )
    db.add(itinerary)
    await db.commit()
    await db.refresh(itinerary)
    return itinerary


@router.delete("/itineraries/{itinerary_id}", status_code=204)
async def delete_itinerary(
    itinerary_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FlightItinerary).where(FlightItinerary.id == itinerary_id))
    itinerary = result.scalar_one_or_none()
    if not itinerary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary not found")
    await db.delete(itinerary)
    await db.commit()
