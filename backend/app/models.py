from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    auth_provider = Column(String, default="google", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    google_access_token = Column(Text, nullable=True)
    google_refresh_token = Column(Text, nullable=True)
    google_token_expiry = Column(DateTime, nullable=True)
    pcs_calendar_id = Column(String, nullable=True)


class WhitelistedEmail(Base):
    __tablename__ = "whitelisted_emails"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="user", nullable=False)
    added_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ChecklistTask(Base):
    __tablename__ = "checklist_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    assigned_to_email = Column(String, nullable=True)
    assigned_to_name = Column(String, nullable=True)
    due_date = Column(DateTime, nullable=True)
    gcal_event_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)


class FlightItinerary(Base):
    __tablename__ = "flight_itineraries"

    id = Column(Integer, primary_key=True, index=True)
    flight_number = Column(String, nullable=False)
    flight_date = Column(String, nullable=True)
    departure_airport = Column(String, nullable=True)
    arrival_airport = Column(String, nullable=True)
    departure_time = Column(String, nullable=True)
    arrival_time = Column(String, nullable=True)
    airline = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_by_email = Column(String, nullable=True)
    gcal_dep_event_id = Column(String, nullable=True)
    gcal_arr_event_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, default="other")
    description = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    content_type = Column(String, nullable=True)
    uploaded_by_email = Column(String, nullable=True)
    is_sensitive = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class HighValueItem(Base):
    __tablename__ = "high_value_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    image_filename = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class HousingWaitlist(Base):
    __tablename__ = "housing_waitlists"

    id = Column(Integer, primary_key=True, index=True)
    base_name = Column(String, nullable=False)
    waitlist_type = Column(String, nullable=False)
    position = Column(Integer, nullable=True)
    status = Column(String, default="active", nullable=False)
    date_applied = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class HousingProperty(Base):
    __tablename__ = "housing_properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    rent = Column(Float, nullable=True)
    utilities_estimate = Column(Float, nullable=True)
    commute_time_minutes = Column(Integer, nullable=True)
    bedrooms = Column(Integer, nullable=True)
    bathrooms = Column(Float, nullable=True)
    pet_friendly = Column(Boolean, default=False, nullable=True)
    notes = Column(Text, nullable=True)
    photos = Column(Text, nullable=True)
    status = Column(String, default="considering", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
