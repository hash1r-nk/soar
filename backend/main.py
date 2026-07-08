import os
import sys
import importlib.util
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Set
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import subprocess
import logging

from database import engine, get_db, Base
from models import Alert, Case, Action, DetectedPattern, DuplicateLog

# Initialize Database
Base.metadata.create_all(bind=engine)

# ---------------------
# LOGGING SETUP
# ---------------------

LOG_FILE = "/var/log/soar_alerts.log"

# Set up file logger for notifications / alert log
soar_logger = logging.getLogger("soar")
soar_logger.setLevel(logging.INFO)
try:
    fh = logging.FileHandler(LOG_FILE)
    fh.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    soar_logger.addHandler(fh)
except PermissionError:
    # Fallback to local log if /var/log is not writable
    LOG_FILE = os.path.join(os.path.dirname(__file__), "soar_alerts.log")
    fh = logging.FileHandler(LOG_FILE)
    fh.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    soar_logger.addHandler(fh)
    print(f"⚠️  Could not write to /var/log/soar_alerts.log, using {LOG_FILE}")

app = FastAPI(title="SOAR Platform", version="1.0.0")

# -----------------------------
# CORS
# -----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correlation Engine settings
CORRELATION_TIME_WINDOW_SECONDS = 300    # 5-minute sliding window
BRUTE_FORCE_THRESHOLD = 5               # alerts from same IP in window
PORT_SCAN_DEST_THRESHOLD = 3            # unique dest IPs from same source
REPEATED_RULE_THRESHOLD = 3             # same rule name count in window
# FIX: Dedup key no longer includes only static fields.
# We add a time-bucket (minute granularity) so that the SAME rule firing
# multiple times from the same IP across different minutes is NOT blocked.
# Only exact-same-minute duplicates (true Splunk retry duplicates) are blocked.
DUPLICATE_FIELDS = ("rule_name", "source_ip", "dest_ip")


# -----------------------------
# REQUEST MODELS
# -----------------------------

# FIX: Removed the broken alias="search_name" on rule_name.
# The previous version had both alias="search_name" AND a separate search_name
# field, causing a Pydantic conflict. The /api/ingest endpoint handles field
# mapping from Splunk's nested format itself, so the model is kept simple.
class SplunkAlert(BaseModel):
    """Simplified alert model used for manual/direct POST to /api/ingest."""
    rule_name: str
    severity: str = "Medium"
    description: str = ""
    source_ip: str = ""
    dest_ip: str = ""
    event_id: str = ""
    search_name: str = ""
    results_link: str = ""
    raw_event: Optional[dict] = None

    class Config:
        populate_by_name = True


class ActionRequest(BaseModel):
    action_type: str  # "block_ip" or "send_notification"
    case_id: int
    target: str = ""  # IP to block or notification recipient
    notes: str = ""


# -----------------------------
# HELPERS
# -----------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _generate_alert_id() -> str:
    return f"ALR-{uuid.uuid4().hex[:8].upper()}"


# -----------------------------
# WebSocket Manager
# -----------------------------
# FIX: Moved ConnectionManager definition and instantiation ABOVE the
# correlation functions that call manager.broadcast(), eliminating the
# forward-reference ordering risk.

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ Client connected ({len(self.active_connections)} total)")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"❌ Client disconnected ({len(self.active_connections)} total)")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


# -----------------------------
# CORRELATION ENGINE
# -----------------------------

def _alert_fingerprint(alert: dict) -> str:
    """
    Generate a SHA-256 fingerprint to identify duplicate alerts.

    FIX: Added a time-bucket (minute-level truncation of current UTC time) to
    the hash so that the SAME rule firing from the SAME IP in different minutes
    are treated as DISTINCT alerts (allowing brute-force/repeat-rule detection).
    Only two identical alerts arriving within the SAME minute are considered
    true Splunk-retry duplicates and are blocked.
    """
    time_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    raw = "|".join(str(alert.get(f, "")) for f in DUPLICATE_FIELDS) + f"|{time_bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _is_duplicate(db: Session, alert: dict) -> bool:
    """Check if an alert with the same fingerprint has already been ingested."""
    fp = _alert_fingerprint(alert)
    exists = db.query(Alert).filter(Alert.fingerprint == fp).first()
    return exists is not None


def _detect_patterns(db: Session, source_ip: str) -> List[str]:
    """
    Analyze the correlation group for a source IP and detect attack patterns.
    Returns a list of pattern names detected.
    """
    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)

    recent_alerts = db.query(Alert).filter(
        Alert.source_ip == source_ip,
        Alert.received_at > cutoff
    ).all()

    patterns = []

    if not recent_alerts:
        return patterns

    # Pattern 1: Brute Force — many alerts from same IP in the time window
    if len(recent_alerts) >= BRUTE_FORCE_THRESHOLD:
        patterns.append("brute_force")

    # Pattern 2: Port Scan — same source hitting multiple unique destinations
    unique_dests = set(a.dest_ip for a in recent_alerts if a.dest_ip)
    if len(unique_dests) >= PORT_SCAN_DEST_THRESHOLD:
        patterns.append("port_scan")

    # Pattern 3: Repeated Rule — same rule fires repeatedly
    rule_counts: Dict[str, int] = {}
    for a in recent_alerts:
        rn = a.rule_name
        rule_counts[rn] = rule_counts.get(rn, 0) + 1
    for rn, count in rule_counts.items():
        if count >= REPEATED_RULE_THRESHOLD:
            patterns.append("repeated_rule")
            break

    return patterns


async def _auto_create_correlated_case(
    db: Session, source_ip: str, patterns: List[str]
) -> Optional[dict]:
    """
    Create a single correlated case that aggregates multiple alerts.
    Avoids creating duplicate correlated cases for the same IP + pattern combo.

    FIX: All references to _pattern_key have been updated to pattern_key to
    match the renamed column in models.py.
    """
    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)

    recent_alerts = db.query(Alert).filter(
        Alert.source_ip == source_ip,
        Alert.received_at > cutoff
    ).all()

    if not recent_alerts:
        return None

    # Check if a correlated case already exists for this IP with same patterns
    # FIX: Case._pattern_key → Case.pattern_key
    pattern_key = f"{source_ip}|{'|'.join(sorted(patterns))}"

    existing_case = db.query(Case).filter(
        Case.pattern_key == pattern_key,
        Case.status != "Closed"
    ).first()

    if existing_case:
        # Update existing correlated case with new alert count
        existing_case.alert_count = len(recent_alerts)
        existing_case.alert_ids = [a.id for a in recent_alerts]
        existing_case.updated_at = _now_dt()
        db.commit()
        db.refresh(existing_case)

        case_dict = {
            "id": existing_case.id,
            "type": existing_case.type,
            "title": existing_case.title,
            "severity": existing_case.severity,
            "source_ip": existing_case.source_ip,
            "patterns": existing_case.patterns,
            "alert_count": existing_case.alert_count,
            "alert_ids": existing_case.alert_ids,
            "description": existing_case.description,
            "status": existing_case.status,
            "created_at": existing_case.created_at.isoformat() if existing_case.created_at else None,
            "updated_at": existing_case.updated_at.isoformat() if existing_case.updated_at else None,
            "pattern_key": existing_case.pattern_key,
        }
        await manager.broadcast({"type": "correlation_update", "data": case_dict})
        return None  # no new case created

    # Determine highest severity from grouped alerts
    severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    max_sev = max(
        recent_alerts,
        key=lambda a: severity_order.get((a.severity or "medium").lower(), 0)
    )

    pattern_labels = {
        "brute_force": "Brute Force Attack",
        "port_scan": "Port Scan Detected",
        "repeated_rule": "Repeated Rule Trigger",
    }
    pattern_desc = ", ".join(pattern_labels.get(p, p) for p in patterns)

    new_case = Case(
        type="correlated",
        title=f"[CORRELATED] {pattern_desc} from {source_ip}",
        severity=max_sev.severity or "Medium",
        source_ip=source_ip,
        patterns=patterns,
        alert_count=len(recent_alerts),
        alert_ids=[a.id for a in recent_alerts],
        description=f"Correlation engine detected {pattern_desc} — {len(recent_alerts)} alerts from {source_ip} within {CORRELATION_TIME_WINDOW_SECONDS}s window.",
        status="Open",
        pattern_key=pattern_key,  # FIX: was _pattern_key
    )

    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    # Log pattern detection
    new_pattern = DetectedPattern(
        source_ip=source_ip,
        patterns=patterns,
        alert_count=len(recent_alerts),
        case_id=new_case.id
    )
    db.add(new_pattern)
    db.commit()
    db.refresh(new_pattern)

    soar_logger.warning(
        f"PATTERN DETECTED | {pattern_desc} | IP: {source_ip} | "
        f"Alerts: {len(recent_alerts)} | Case #{new_case.id}"
    )
    print(f"🔗 CORRELATION: {pattern_desc} from {source_ip} — case #{new_case.id} created")

    corr_case_dict = {
        "id": new_case.id,
        "type": new_case.type,
        "title": new_case.title,
        "severity": new_case.severity,
        "source_ip": new_case.source_ip,
        "patterns": new_case.patterns,
        "alert_count": new_case.alert_count,
        "alert_ids": new_case.alert_ids,
        "description": new_case.description,
        "status": new_case.status,
        "created_at": new_case.created_at.isoformat() if new_case.created_at else None,
        "updated_at": new_case.updated_at.isoformat() if new_case.updated_at else None,
        "pattern_key": new_case.pattern_key,  # FIX: was _pattern_key
    }

    detection_dict = {
        "id": new_pattern.id,
        "source_ip": new_pattern.source_ip,
        "patterns": new_pattern.patterns,
        "alert_count": new_pattern.alert_count,
        "case_id": new_pattern.case_id,
        "detected_at": new_pattern.detected_at.isoformat() if new_pattern.detected_at else None
    }

    # Broadcast events
    await manager.broadcast({"type": "new_case", "data": corr_case_dict})
    await manager.broadcast({"type": "pattern_detected", "data": detection_dict})
    await manager.broadcast({"type": "correlation_update", "data": corr_case_dict})

    return corr_case_dict


# -----------------------------
# STATIC FILES & DASHBOARD
# -----------------------------

templates_dir = os.path.join(os.path.dirname(__file__), "templates")


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index_path = os.path.join(templates_dir, "index.html")
    try:
        with open(index_path, "r") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("<h1>Dashboard not found</h1>", status_code=404)


@app.get("/style.css")
async def serve_css():
    return FileResponse(os.path.join(templates_dir, "style.css"), media_type="text/css")


@app.get("/script.js")
async def serve_js():
    return FileResponse(os.path.join(templates_dir, "script.js"), media_type="application/javascript")


@app.get("/favicon.ico")
async def serve_favicon():
    path = os.path.join(templates_dir, "favicon.ico")
    if os.path.exists(path):
        return FileResponse(path)
    return HTMLResponse("", status_code=204)


# -----------------------------
# SPLUNK WEBHOOK INGEST
# -----------------------------

@app.post("/api/ingest")
async def ingest_alert(payload: dict, db: Session = Depends(get_db)):
    """
    Accepts Splunk webhook JSON or a simplified manual JSON.
    Splunk sends: { "result": { ... }, "search_name": "...", "results_link": "..." }
    Manual:       { "rule_name": "...", "severity": "...", ... }

    Correlation Engine integration:
    - Checks for duplicates before storing (time-bucketed fingerprint)
    - Groups alerts by source IP in a time window
    - Detects patterns (brute force, port scan, repeated rule)
    - Auto-creates correlated cases when patterns are detected
    """

    # Handle Splunk's nested format
    if "result" in payload:
        result = payload.get("result", {})
        alert_data = {
            "id": _generate_alert_id(),
            "rule_name": payload.get("search_name", result.get("rule_name", "Unknown Rule")),
            "severity": result.get("severity", payload.get("severity", "Medium")),
            "description": result.get("description", payload.get("description", "")),
            "source_ip": result.get("src_ip", result.get("source_ip", "")),
            "dest_ip": result.get("dest_ip", ""),
            "event_id": result.get("event_id", ""),
            "search_name": payload.get("search_name", ""),
            "results_link": payload.get("results_link", ""),
            "raw_event": result,
        }
    else:
        # Simplified manual format
        alert_data = {
            "id": _generate_alert_id(),
            "rule_name": payload.get("rule_name", "Unknown Rule"),
            "severity": payload.get("severity", "Medium"),
            "description": payload.get("description", ""),
            "source_ip": payload.get("source_ip", ""),
            "dest_ip": payload.get("dest_ip", ""),
            "event_id": payload.get("event_id", ""),
            "search_name": payload.get("search_name", ""),
            "results_link": payload.get("results_link", ""),
            "raw_event": payload.get("raw_event"),
        }

    fp = _alert_fingerprint(alert_data)
    alert_data["fingerprint"] = fp

    # --- Correlation Engine: Duplicate Check ---
    if _is_duplicate(db, alert_data):
        existing = db.query(Alert).filter(Alert.fingerprint == fp).first()
        existing_id = existing.id if existing else None
        print(f"⚡ DEDUP: Duplicate alert blocked (matches {existing_id})")

        # FIX: Log the duplicate to the DB so duplicates_blocked stat is real
        dup_log = DuplicateLog(fingerprint=fp, existing_alert_id=existing_id)
        db.add(dup_log)
        db.commit()

        return {
            "status": "duplicate_skipped",
            "existing_alert_id": existing_id,
            "message": "Duplicate alert — already ingested with matching fingerprint.",
        }

    # Store Alert
    db_alert = Alert(**alert_data)
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)

    # Convert to dict for websocket
    alert_dict = {
        "id": db_alert.id,
        "rule_name": db_alert.rule_name,
        "severity": db_alert.severity,
        "description": db_alert.description,
        "source_ip": db_alert.source_ip,
        "dest_ip": db_alert.dest_ip,
        "event_id": db_alert.event_id,
        "search_name": db_alert.search_name,
        "results_link": db_alert.results_link,
        "raw_event": db_alert.raw_event,
        "received_at": db_alert.received_at.isoformat() if db_alert.received_at else None,
        "status": db_alert.status,
    }

    # Auto-create a standard case from the alert
    new_case = Case(
        type="standard",
        alert_id=db_alert.id,
        title=db_alert.rule_name,
        severity=db_alert.severity,
        description=db_alert.description,
        source_ip=db_alert.source_ip,
        dest_ip=db_alert.dest_ip,
        status="Open"
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    case_dict = {
        "id": new_case.id,
        "type": new_case.type,
        "alert_id": new_case.alert_id,
        "title": new_case.title,
        "severity": new_case.severity,
        "description": new_case.description,
        "source_ip": new_case.source_ip,
        "dest_ip": new_case.dest_ip,
        "status": new_case.status,
        "created_at": new_case.created_at.isoformat() if new_case.created_at else None,
        "updated_at": new_case.updated_at.isoformat() if new_case.updated_at else None,
    }

    # Broadcast to all connected dashboard clients
    await manager.broadcast({"type": "new_alert", "data": alert_dict})
    await manager.broadcast({"type": "new_case", "data": case_dict})

    # --- Correlation Engine: Grouping & Pattern Detection ---
    correlated_case = None
    source_ip = db_alert.source_ip
    if source_ip:
        patterns = _detect_patterns(db, source_ip)
        if patterns:
            correlated_case = await _auto_create_correlated_case(db, source_ip, patterns)

    await manager.broadcast({"type": "stats_update", "data": _build_stats(db)})

    response = {
        "status": "received",
        "alert_id": db_alert.id,
        "case_id": new_case.id,
    }
    if correlated_case:
        response["correlated_case_id"] = correlated_case["id"]
        response["patterns_detected"] = correlated_case["patterns"]
    return response


# -----------------------------
# ALERTS
# -----------------------------

@app.get("/api/alerts")
def get_alerts(
    severity: Optional[str] = Query(None),
    query_str: Optional[str] = Query(None, alias="query"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(Alert)
    if severity:
        query = query.filter(func.lower(Alert.severity) == severity.lower())
    if query_str:
        search = f"%{query_str}%"
        query = query.filter(or_(
            Alert.rule_name.ilike(search),
            Alert.source_ip.ilike(search),
            Alert.description.ilike(search)
        ))

    total = query.count()
    alerts = query.order_by(Alert.received_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [{
            "id": a.id,
            "rule_name": a.rule_name,
            "severity": a.severity,
            "description": a.description,
            "source_ip": a.source_ip,
            "dest_ip": a.dest_ip,
            "event_id": a.event_id,
            "search_name": a.search_name,
            "results_link": a.results_link,
            "raw_event": a.raw_event,
            "received_at": a.received_at.isoformat() if a.received_at else None,
            "status": a.status,
        } for a in alerts]
    }


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str, db: Session = Depends(get_db)):
    # FIX: Return proper HTTP 404 instead of {"error": ...} with 200 OK
    a = db.query(Alert).filter(Alert.id == alert_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {
        "id": a.id,
        "rule_name": a.rule_name,
        "severity": a.severity,
        "description": a.description,
        "source_ip": a.source_ip,
        "dest_ip": a.dest_ip,
        "event_id": a.event_id,
        "search_name": a.search_name,
        "results_link": a.results_link,
        "raw_event": a.raw_event,
        "received_at": a.received_at.isoformat() if a.received_at else None,
        "status": a.status,
    }


# -----------------------------
# CASES
# -----------------------------

@app.get("/api/cases")
def get_cases(
    status: Optional[str] = Query(None),
    query_str: Optional[str] = Query(None, alias="query"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(Case)
    if status:
        query = query.filter(func.lower(Case.status) == status.lower())
    if query_str:
        search = f"%{query_str}%"
        query = query.filter(or_(
            Case.title.ilike(search),
            Case.source_ip.ilike(search),
            Case.description.ilike(search)
        ))

    total = query.count()
    cases = query.order_by(Case.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [{
            "id": c.id,
            "type": c.type,
            "alert_id": c.alert_id,
            "title": c.title,
            "severity": c.severity,
            "description": c.description,
            "source_ip": c.source_ip,
            "dest_ip": c.dest_ip,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "patterns": c.patterns,
            "alert_count": c.alert_count,
            "alert_ids": c.alert_ids,
        } for c in cases]
    }


@app.get("/api/cases/{case_id}")
def get_case(case_id: int, db: Session = Depends(get_db)):
    # FIX: Return proper HTTP 404 instead of {"error": ...} with 200 OK
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return {
        "id": c.id,
        "type": c.type,
        "alert_id": c.alert_id,
        "title": c.title,
        "severity": c.severity,
        "description": c.description,
        "source_ip": c.source_ip,
        "dest_ip": c.dest_ip,
        "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "patterns": c.patterns,
        "alert_count": c.alert_count,
        "alert_ids": c.alert_ids,
    }


@app.put("/api/cases/{case_id}/acknowledge")
async def acknowledge_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case.status = "Acknowledged"

    # Also update linked alerts
    if case.type == "standard" and case.alert_id:
        alert = db.query(Alert).filter(Alert.id == case.alert_id).first()
        if alert:
            alert.status = "Acknowledged"
    elif case.type == "correlated" and case.alert_ids:
        alerts = db.query(Alert).filter(Alert.id.in_(case.alert_ids)).all()
        for a in alerts:
            a.status = "Acknowledged"

    db.commit()
    db.refresh(case)

    case_dict = {
        "id": case.id,
        "type": case.type,
        "alert_id": case.alert_id,
        "title": case.title,
        "severity": case.severity,
        "description": case.description,
        "source_ip": case.source_ip,
        "dest_ip": case.dest_ip,
        "status": case.status,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "patterns": case.patterns,
        "alert_count": case.alert_count,
        "alert_ids": case.alert_ids,
    }

    await manager.broadcast({"type": "case_update", "data": case_dict})
    await manager.broadcast({"type": "stats_update", "data": _build_stats(db)})
    return case_dict


@app.put("/api/cases/{case_id}/close")
async def close_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case.status = "Closed"

    # Also update linked alerts
    if case.type == "standard" and case.alert_id:
        alert = db.query(Alert).filter(Alert.id == case.alert_id).first()
        if alert:
            alert.status = "Closed"
    elif case.type == "correlated" and case.alert_ids:
        alerts = db.query(Alert).filter(Alert.id.in_(case.alert_ids)).all()
        for a in alerts:
            a.status = "Closed"

    db.commit()
    db.refresh(case)

    case_dict = {
        "id": case.id,
        "type": case.type,
        "alert_id": case.alert_id,
        "title": case.title,
        "severity": case.severity,
        "description": case.description,
        "source_ip": case.source_ip,
        "dest_ip": case.dest_ip,
        "status": case.status,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "patterns": case.patterns,
        "alert_count": case.alert_count,
        "alert_ids": case.alert_ids,
    }

    await manager.broadcast({"type": "case_update", "data": case_dict})
    await manager.broadcast({"type": "stats_update", "data": _build_stats(db)})
    return case_dict


# -----------------------------
# AUTOMATED ACTIONS / PLAYBOOKS
# -----------------------------

PLAYBOOKS_DIR = os.path.join(os.path.dirname(__file__), "playbooks")

def load_playbook(name):
    filepath = os.path.join(PLAYBOOKS_DIR, f"{name}.py")
    if not os.path.exists(filepath):
        return None
    spec = importlib.util.spec_from_file_location(name, filepath)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

@app.get("/api/playbooks")
def list_playbooks():
    playbooks = []
    if os.path.exists(PLAYBOOKS_DIR):
        for f in os.listdir(PLAYBOOKS_DIR):
            if f.endswith(".py") and not f.startswith("__"):
                name = f[:-3]
                try:
                    mod = load_playbook(name)
                    playbooks.append({
                        "id": name,
                        "name": getattr(mod, "NAME", name),
                        "description": getattr(mod, "DESCRIPTION", "")
                    })
                except Exception:
                    pass
    return playbooks

@app.post("/api/playbooks/{playbook_id}/run")
async def run_playbook(playbook_id: str, req: ActionRequest, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == req.case_id).first()
    if not case:
        # FIX: Return proper HTTP 404 instead of {"error": ...} with 200 OK
        raise HTTPException(status_code=404, detail="Case not found")

    mod = load_playbook(playbook_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Playbook not found")

    new_action = Action(
        action_type=f"Playbook: {getattr(mod, 'NAME', playbook_id)}",
        case_id=req.case_id,
        target=req.target,
        notes=req.notes,
        status="Completed",
        result=""
    )

    try:
        result_msg = mod.execute(case, db, soar_logger)
        new_action.result = str(result_msg)
        print(f"✅ PLAYBOOK SUCCESS: {playbook_id} for case #{req.case_id}")
    except Exception as e:
        new_action.status = "Failed"
        new_action.result = f"Error: {str(e)}"
        print(f"❌ PLAYBOOK FAILED: {playbook_id} - {str(e)}")

    db.add(new_action)
    db.commit()
    db.refresh(new_action)

    action_dict = {
        "id": new_action.id,
        "action_type": new_action.action_type,
        "case_id": new_action.case_id,
        "target": new_action.target,
        "notes": new_action.notes,
        "executed_at": new_action.executed_at.isoformat() if new_action.executed_at else None,
        "status": new_action.status,
        "result": new_action.result
    }

    await manager.broadcast({"type": "new_action", "data": action_dict})
    await manager.broadcast({"type": "stats_update", "data": _build_stats(db)})

    return action_dict

@app.get("/api/actions")
def get_actions(db: Session = Depends(get_db)):
    actions = db.query(Action).order_by(Action.executed_at.desc()).all()
    return [{
        "id": a.id,
        "action_type": a.action_type,
        "case_id": a.case_id,
        "target": a.target,
        "notes": a.notes,
        "executed_at": a.executed_at.isoformat() if a.executed_at else None,
        "status": a.status,
        "result": a.result,
    } for a in actions]


# -----------------------------
# CORRELATION API ENDPOINTS
# -----------------------------

@app.get("/api/correlation/groups")
def get_correlation_groups(db: Session = Depends(get_db)):
    """Return all IP groups with alert counts and time range based on a 5 minute sliding window."""
    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)

    # Query all alerts in the last 5 minutes
    recent_alerts = db.query(Alert).filter(Alert.received_at > cutoff).all()

    # Group by IP in memory for easy processing
    groups = {}
    for a in recent_alerts:
        if not a.source_ip: continue
        if a.source_ip not in groups:
            groups[a.source_ip] = []
        groups[a.source_ip].append(a)

    result = []
    for ip, alerts_list in groups.items():
        if not alerts_list:
            continue
        timestamps = [a.received_at for a in alerts_list if a.received_at]
        result.append({
            "source_ip": ip,
            "alert_count": len(alerts_list),
            "alert_ids": [a.id for a in alerts_list],
            "first_seen": min(timestamps).isoformat() if timestamps else None,
            "last_seen": max(timestamps).isoformat() if timestamps else None,
            "rules": list(set(a.rule_name for a in alerts_list if a.rule_name)),
            "dest_ips": list(set(a.dest_ip for a in alerts_list if a.dest_ip)),
            "active_patterns": _detect_patterns(db, ip),
        })
    # Sort by alert count descending
    result.sort(key=lambda g: g["alert_count"], reverse=True)
    return result


@app.get("/api/correlation/groups/{ip}")
def get_correlation_group(ip: str, db: Session = Depends(get_db)):
    """Return all recent alerts for a specific source IP."""
    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)
    recent_alerts = db.query(Alert).filter(
        Alert.source_ip == ip,
        Alert.received_at > cutoff
    ).order_by(Alert.received_at.desc()).all()

    if not recent_alerts:
        raise HTTPException(status_code=404, detail="No correlation group found for this IP")

    return {
        "source_ip": ip,
        "alerts": [{
            "id": a.id,
            "rule_name": a.rule_name,
            "severity": a.severity,
            "description": a.description,
            "source_ip": a.source_ip,
            "dest_ip": a.dest_ip,
            "received_at": a.received_at.isoformat() if a.received_at else None,
        } for a in recent_alerts],
        "active_patterns": _detect_patterns(db, ip),
    }


@app.get("/api/correlation/patterns")
def get_detected_patterns(db: Session = Depends(get_db)):
    """Return the pattern detection log."""
    patterns = db.query(DetectedPattern).order_by(DetectedPattern.detected_at.desc()).all()
    return [{
        "id": p.id,
        "source_ip": p.source_ip,
        "patterns": p.patterns,
        "alert_count": p.alert_count,
        "case_id": p.case_id,
        "detected_at": p.detected_at.isoformat() if p.detected_at else None,
    } for p in patterns]


@app.get("/api/correlation/stats")
def get_correlation_stats(db: Session = Depends(get_db)):
    """Return correlation engine statistics."""
    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)

    # Get distinct IPs in recent window for groups count
    active_ips_count = db.query(func.count(func.distinct(Alert.source_ip))).filter(Alert.received_at > cutoff).scalar() or 0

    # Active groups (IPs with more than 1 alert in window)
    group_counts = db.query(Alert.source_ip, func.count(Alert.id)).filter(Alert.received_at > cutoff).group_by(Alert.source_ip).all()
    active_groups = sum(1 for _, count in group_counts if count > 1)

    patterns_detected = db.query(func.count(DetectedPattern.id)).scalar() or 0
    correlated_cases = db.query(func.count(Case.id)).filter(Case.type == "correlated").scalar() or 0
    # FIX: duplicates_blocked is now a real DB count from DuplicateLog table
    duplicates_blocked = db.query(func.count(DuplicateLog.id)).scalar() or 0

    return {
        "total_groups": active_ips_count,
        "active_groups": active_groups,
        "patterns_detected": patterns_detected,
        "duplicates_blocked": duplicates_blocked,
        "correlated_cases": correlated_cases,
        "time_window_seconds": CORRELATION_TIME_WINDOW_SECONDS,
        "brute_force_threshold": BRUTE_FORCE_THRESHOLD,
    }


# -----------------------------
# STATS
# -----------------------------

def _build_stats(db: Session) -> dict:
    total_alerts = db.query(func.count(Alert.id)).scalar() or 0

    open_cases = db.query(func.count(Case.id)).filter(func.lower(Case.status) == "open").scalar() or 0
    acknowledged_cases = db.query(func.count(Case.id)).filter(func.lower(Case.status) == "acknowledged").scalar() or 0
    closed_cases = db.query(func.count(Case.id)).filter(func.lower(Case.status) == "closed").scalar() or 0

    high_severity = db.query(func.count(Alert.id)).filter(func.lower(Alert.severity) == "high").scalar() or 0
    medium_severity = db.query(func.count(Alert.id)).filter(func.lower(Alert.severity) == "medium").scalar() or 0
    low_severity = db.query(func.count(Alert.id)).filter(func.lower(Alert.severity) == "low").scalar() or 0
    critical_severity = db.query(func.count(Alert.id)).filter(func.lower(Alert.severity) == "critical").scalar() or 0

    total_actions = db.query(func.count(Action.id)).scalar() or 0

    cutoff = _now_dt() - timedelta(seconds=CORRELATION_TIME_WINDOW_SECONDS)
    correlation_groups = db.query(func.count(func.distinct(Alert.source_ip))).filter(Alert.received_at > cutoff).scalar() or 0
    patterns_detected = db.query(func.count(DetectedPattern.id)).scalar() or 0
    correlated_cases = db.query(func.count(Case.id)).filter(Case.type == "correlated").scalar() or 0
    # FIX: Real DB-backed count instead of hardcoded 0
    duplicates_blocked = db.query(func.count(DuplicateLog.id)).scalar() or 0

    return {
        "total_alerts": total_alerts,
        "open_cases": open_cases,
        "acknowledged_cases": acknowledged_cases,
        "closed_cases": closed_cases,
        "high_severity": high_severity,
        "medium_severity": medium_severity,
        "low_severity": low_severity,
        "critical_severity": critical_severity,
        "total_actions": total_actions,
        # Correlation stats
        "correlation_groups": correlation_groups,
        "patterns_detected": patterns_detected,
        "duplicates_blocked": duplicates_blocked,
        "correlated_cases": correlated_cases,
    }


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    return _build_stats(db)

# -----------------------------
# WEBSOCKET
# -----------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
