from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class UserResponse(BaseModel):
    email: str
    name: Optional[str]
    picture: Optional[str]
    is_admin: bool
    auth_provider: str
    created_at: datetime
    last_login: Optional[datetime]

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    email: str
    name: Optional[str]
    picture: Optional[str]

    model_config = {"from_attributes": True}


class LocalLoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    user: UserResponse


class WhitelistEntryCreate(BaseModel):
    email: str
    role: str = "user"


class WhitelistRoleUpdate(BaseModel):
    role: str


class WhitelistEntryResponse(BaseModel):
    id: int
    email: str
    role: str
    added_by_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistTaskCreate(BaseModel):
    title: str
    category: str
    assigned_to_email: Optional[str] = None
    assigned_to_name: Optional[str] = None
    due_date: Optional[datetime] = None


class ChecklistTaskUpdate(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    assigned_to_email: Optional[str] = None
    assigned_to_name: Optional[str] = None
    due_date: Optional[datetime] = None


class ChecklistTaskResponse(BaseModel):
    id: int
    title: str
    category: str
    is_completed: bool
    assigned_to_email: Optional[str]
    assigned_to_name: Optional[str]
    due_date: Optional[datetime]
    gcal_event_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class FlightItineraryCreate(BaseModel):
    flight_number: str
    flight_date: Optional[str] = None
    departure_airport: Optional[str] = None
    arrival_airport: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    airline: Optional[str] = None
    notes: Optional[str] = None


class FlightItineraryResponse(BaseModel):
    id: int
    flight_number: str
    flight_date: Optional[str]
    departure_airport: Optional[str]
    arrival_airport: Optional[str]
    departure_time: Optional[str]
    arrival_time: Optional[str]
    airline: Optional[str]
    notes: Optional[str]
    created_by_email: Optional[str]
    gcal_dep_event_id: Optional[str] = None
    gcal_arr_event_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: int
    name: str
    category: str
    description: Optional[str]
    filename: str
    original_filename: str
    file_size: Optional[int]
    content_type: Optional[str]
    uploaded_by_email: Optional[str]
    is_sensitive: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class HighValueItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: Optional[float]
    notes: Optional[str]
    serial_number: Optional[str]
    image_filename: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class WaitlistCreate(BaseModel):
    base_name: str
    waitlist_type: str
    position: Optional[int] = None
    status: str = "active"
    date_applied: Optional[str] = None
    notes: Optional[str] = None


class WaitlistUpdate(BaseModel):
    base_name: Optional[str] = None
    waitlist_type: Optional[str] = None
    position: Optional[int] = None
    status: Optional[str] = None
    date_applied: Optional[str] = None
    notes: Optional[str] = None


class WaitlistResponse(BaseModel):
    id: int
    base_name: str
    waitlist_type: str
    position: Optional[int]
    status: str
    date_applied: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PropertyResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    rent: Optional[float]
    utilities_estimate: Optional[float]
    commute_time_minutes: Optional[int]
    bedrooms: Optional[int]
    bathrooms: Optional[float]
    pet_friendly: Optional[bool]
    notes: Optional[str]
    photos: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
