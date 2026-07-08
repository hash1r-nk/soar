from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from datetime import datetime, timezone
from database import Base

def _now():
    return datetime.now(timezone.utc)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    rule_name = Column(String, index=True)
    severity = Column(String)
    description = Column(Text)
    source_ip = Column(String, index=True)
    dest_ip = Column(String, index=True)
    event_id = Column(String)
    search_name = Column(String)
    results_link = Column(String)
    raw_event = Column(JSON, nullable=True)
    received_at = Column(DateTime(timezone=True), default=_now)
    status = Column(String, default="New")
    fingerprint = Column(String, unique=True, index=True)

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String, default="standard")  # standard or correlated
    alert_id = Column(String, nullable=True)   # Primary alert if standard
    title = Column(String)
    severity = Column(String)
    description = Column(Text)
    source_ip = Column(String, index=True)
    dest_ip = Column(String)
    status = Column(String, default="Open")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Fields specific to correlated cases
    patterns = Column(JSON, nullable=True)
    alert_count = Column(Integer, default=1)
    alert_ids = Column(JSON, nullable=True)
    # FIX: Renamed from _pattern_key to pattern_key.
    # SQLAlchemy does not map underscore-prefixed attributes correctly through the ORM,
    # causing silent failures on filter() and attribute access.
    pattern_key = Column(String, index=True, nullable=True)

class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action_type = Column(String)
    case_id = Column(Integer, index=True)
    target = Column(String)
    notes = Column(Text)
    executed_at = Column(DateTime(timezone=True), default=_now)
    status = Column(String)
    result = Column(Text)

class DetectedPattern(Base):
    __tablename__ = "detected_patterns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source_ip = Column(String, index=True)
    patterns = Column(JSON)
    alert_count = Column(Integer)
    case_id = Column(Integer)
    detected_at = Column(DateTime(timezone=True), default=_now)

class DuplicateLog(Base):
    """Tracks deduplicated (blocked) alerts so the stat can be reported."""
    __tablename__ = "duplicate_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    fingerprint = Column(String, index=True)
    existing_alert_id = Column(String)
    blocked_at = Column(DateTime(timezone=True), default=_now)
