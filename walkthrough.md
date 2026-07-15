# Yoru Setup & Splunk Integration Guide

Welcome to **Yoru**, a Security Orchestration, Automation, and Response (SOAR) platform! This tool provides a dashboard that visualizes security alerts, correlates related cases, and provides actionable playbooks for incident response.

This guide is designed for first-time users to quickly get the platform up and running, connect it to Splunk, and understand the alert ingestion pipeline.

---

## 1. How to Set Up Yoru

You can run this project using **Docker (Recommended)** or **Manually**. 

### Option A: Using Docker (Recommended)
This is the easiest way to start, as it automatically sets up the database, backend, and frontend containers.

1. **Clone the repository and enter the directory:**
   ```bash
   git clone https://github.com/hash1r-nk/YORU.git
   cd YORU
   ```
2. **Start the services using Docker Compose:**
   ```bash
   docker-compose up --build -d
   ```
3. **Access the application:**
   - **Frontend Dashboard:** http://localhost:3000
   - **Backend API:** http://localhost:8000

> [!TIP]
> To view logs for the services, use `docker-compose logs -f`.

### Option B: Manual Setup
If you prefer running the services locally without Docker:

1. **Start the Backend (FastAPI):**
   ```bash
   cd YORU
   python -m venv venv
   source venv/bin/activate
   pip install -r backend/requirements.txt
   uvicorn backend.main:app --reload
   ```

2. **Start the Frontend (Next.js/React):**
   ```bash
   cd YORU/frontend
   npm install
   npm run dev
   ```

---

## 2. Connecting Splunk to Yoru

To send alerts from Splunk to Yoru, you need to configure a **Webhook Action** in your Splunk alerts.

### Steps to Configure Splunk:
1. In Splunk, go to **Settings > Searches, Reports, and Alerts**.
2. Select or create an Alert.
3. Scroll down to **Trigger Actions** and click **+ Add Actions**.
4. Choose **Webhook**.
5. In the Webhook URL field, enter your Yoru backend ingest URL. If your backend is running on `http://192.168.1.50:8000`, the URL will be:
   ```text
   http://192.168.1.50:8000/api/ingest
   ```
6. Save the alert. Splunk will now automatically push a JSON payload to Yoru whenever the alert triggers.

> [!IMPORTANT]
> Ensure that the machine running Splunk has network connectivity to the machine running the Yoru backend on port `8000`.

---

## 3. How the Backend Receives Alerts

When Splunk (or any external tool) sends an alert, it hits the `POST /api/ingest` endpoint on the backend. Here is how the backend processes that data:

### 1. Payload Parsing
The API expects a JSON payload and seamlessly handles two distinct formats:
- **Splunk Native Format:** It looks for a nested `result` dictionary and automatically extracts fields like `search_name`, `severity`, `src_ip`, and `dest_ip`.
- **Manual/Simplified Format:** A flat JSON structure (e.g., sent via a simple cURL command or custom script) containing `rule_name`, `severity`, `source_ip`, etc.

### 2. Deduplication Check
To prevent spam, the engine calculates a **SHA-256 fingerprint** of the incoming alert using the rule name, source IP, destination IP, and the current minute.
- If an exact duplicate arrives within the **same minute** (often caused by Splunk webhook retries), it is safely blocked and logged.

### 3. Case Creation & Correlation Engine
Once an alert is validated and saved:
- A **Standard Case** is immediately created for incident tracking.
- The **Correlation Engine** groups the alert by `source_ip` within a 5-minute sliding window.

> [!NOTE]
> **Automated Threat Detection:** The engine analyzes these groups and automatically flags patterns:
> - **Brute Force:** Multiple alerts from the same IP.
> - **Port Scan:** One source IP targeting multiple unique destination IPs.
> - **Repeated Rule:** The same specific rule triggering repeatedly.

If a pattern is detected, the engine auto-creates a single **Correlated Case** (or updates an existing one), aggregating all related alerts to help analysts see the bigger picture without being overwhelmed by noisy individual alerts.

### 4. Real-time Broadcasting
Finally, the backend uses **WebSockets** to instantly push the new alert and case data to any active Frontend Dashboard clients, allowing analysts to see updates in real-time without refreshing the page.
