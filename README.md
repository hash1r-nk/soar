# YORU 

# 🛡️ SOAR Platform

> **Security Orchestration, Automation, and Response (SOAR)** platform built for real-time threat monitoring, correlation, and automated incident response.

---

## 📖 Overview

This project is a **lightweight, real-time SOC platform** designed to simulate modern security operations workflows. It ingests alerts from external sources (like SIEM tools), correlates attack patterns, and enables analysts to investigate and respond efficiently.

### 🔥 Key Capabilities

* 📥 **Alert Ingestion** – Accept alerts via webhook (Splunk, Wazuh, custom sources)
* 🔁 **Correlation Engine** – Detects:

  * Brute-force attacks
  * Port scans
  * Repeated rule triggers
* 📂 **Case Management** – Auto-create and manage security incidents
* ⚙️ **Playbooks** – Execute automated response actions
* 📡 **Real-time Updates** – WebSocket-based live dashboard
* 🧠 **Deduplication Logic** – Prevent alert flooding
* 🐳 **Dockerized Setup** – Easy deployment with Docker Compose

---

## 🏗️ Tech Stack

### Backend

* **FastAPI** (Python)
* **SQLAlchemy** ORM
* **SQLite** (default, upgradeable to PostgreSQL)
* **WebSockets** for real-time updates

### Frontend

* **Next.js (React + TypeScript)**
* **Tailwind CSS** (glassmorphism UI)
* **Axios** for API communication

### DevOps

* **Docker & Docker Compose**
* **Nginx (optional for production)**

---

## 🚀 Quick Start (Docker)

```bash
git clone https://github.com/hash1r-nk/soar.git
cd soar

docker compose up --build -d
```

### 🌐 Access

* Frontend UI → http://localhost:3000
* Backend API → http://localhost:8000
* Swagger Docs → http://localhost:8000/docs

---

## 📂 Project Structure

```
soar/
├── backend/
│   ├── main.py              # API routes & correlation engine
│   ├── models.py            # Database models
│   ├── database.py          # DB setup
│   ├── playbooks/           # Automation scripts
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/      # UI panels (Alerts, Cases, Engine)
│   │   ├── hooks/           # Custom hooks (useSOAR)
│   │   └── lib/             # API utilities
│   ├── Dockerfile
│   └── next.config.ts
│
├── docker-compose.yml
└── README.md
```

---

## 🛠️ Local Development

### 🔧 Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 🎨 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 📡 API Endpoints

| Method | Endpoint                  | Description             |
| ------ | ------------------------- | ----------------------- |
| POST   | `/api/ingest`             | Ingest alerts (webhook) |
| GET    | `/api/alerts`             | Retrieve alerts         |
| GET    | `/api/cases`              | Retrieve cases          |
| POST   | `/api/playbooks/{id}/run` | Execute playbook        |
| WS     | `/ws`                     | Real-time updates       |

---

## 🎯 Features

* 🔍 Advanced filtering (IP, severity, search)
* 📊 Correlation engine visualization
* ⚡ Real-time alert & case updates
* 🧾 Case tracking & lifecycle management
* 🧪 Designed for SOC labs & learning environments

---

## 🚧 Upcoming Improvements

* 📄 Case detail modal with raw logs
* 🧠 Advanced correlation rules (ML-based)
* 🗄️ PostgreSQL support for scalability
* 🔐 Role-Based Access Control (RBAC)
* 📊 Dashboard analytics (charts & metrics)

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repo
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

---

## 📄 License

Licensed under the **MIT License**

---

## 👨‍💻 Author

**Hashir Muhammed NK**
🔗 GitHub: https://github.com/hash1r-nk

---

## ⭐ Support

If you found this project useful:

* ⭐ Star the repo
* 🍴 Fork it
* 📢 Share it

---

> Built as part of a cybersecurity learning journey — combining both **offensive and defensive security concepts** into a practical SOC platform.
