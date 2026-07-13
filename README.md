# Yoru

🚀 **Live Repo:** https://github.com/hash1r-nk/soar

## Overview

A Security Orchestration, Automation, and Response (SOAR) dashboard that visualises alerts, correlated cases, and provides actionable playbooks. Features include:
- Real‑time alerts with hover details and timestamps
- Search / filter by severity, IP, status, and free‑text query
- Correlation engine with deduplication and pattern detection (brute‑force, port‑scan, repeated rules)
- Case detail modal showing raw log/event snippets
- Playbook integration for automated response actions

## Quick Start

```bash
# Clone the repo
git clone https://github.com/hash1r-nk/soar.git
cd soar

# Backend
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Architecture

- **Backend:** FastAPI + WebSockets, correlation logic in `backend/correlation.py`
- **Frontend:** React/TypeScript with glass‑morphism UI, custom hooks in `frontend/src/hooks/useSOAR.ts`
- **API:** `frontend/src/lib/api.ts` wraps CRUD endpoints and log fetching

## License

MIT License – feel free to fork, modify, and contribute!