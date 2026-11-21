# Evently — Campus Event Management System

> **CSE 3422 Software Engineering Lab** | UIU  
> Real-time ticket booking with live seat selection, secure payments, and instant confirmation.

**Team:**  Abdullah Al Mahmud (0112420610) · Mohaimin Mahi (0112420679) · Lukiya Tuz Zaman (0112420512)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| State | Zustand |
| Backend | FastAPI (Python) |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 (Supabase) |
| Cache / Locks | Redis (Upstash) |
| Real-time | WebSockets + Redis Pub/Sub |
| Auth | JWT + Google OAuth2 |
| Email | Resend |
| Payments | SSLCommerz (Sandbox) |
| Deployment | Vercel + Render + Supabase + Upstash |

---

## Project Structure

```
evently/
├── frontend/          # React 19 + TypeScript
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       ├── hooks/
│       ├── services/
│       └── types/
├── backend/           # FastAPI
│   ├── app/
│   │   ├── api/v1/   # Route handlers
│   │   ├── core/     # Config, DB, Redis, Security
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic schemas
│   │   └── services/ # Business logic
│   └── alembic/      # DB migrations
├── .gitignore
└── README.md
```

---

## Local Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL (local) OR Supabase project URL
- Redis (local) OR Upstash Redis URL

---

### Backend Setup

```bash
cd backend

# 1. Create virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
copy .env.example .env
# Edit .env with your actual values (see section below)

# 4. Run database migrations
alembic upgrade head

# 5. Start development server
uvicorn app.main:app --reload --port 8000
```

API will be available at: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

---

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment
copy .env.example .env
# Edit VITE_API_URL if needed

# 3. Start dev server
npm run dev
```

Frontend will be at: `http://localhost:5173`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) | `postgresql+asyncpg://user:pass@host:5432/evently` |
| `REDIS_URL` | Redis connection string | `redis://default:pass@host:port` |
| `SECRET_KEY` | JWT signing secret (min 32 chars) | `your-long-random-secret-key-here` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | `http://localhost:8000/api/v1/auth/google/callback` |
| `FRONTEND_URL` | Frontend origin for CORS + redirects | `http://localhost:5173` |
| `RESEND_API_KEY` | Resend email service API key | From resend.com |
| `SSLCOMMERZ_STORE_ID` | SSLCommerz store ID | From sandbox.sslcommerz.com |
| `SSLCOMMERZ_STORE_PASSWORD` | SSLCommerz store password | From sandbox.sslcommerz.com |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000/api/v1` |

---

## External Service Setup

### Supabase (Database)
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database → Connection String** → copy the URI (use **"URI"** tab, asyncpg format)
3. Replace `postgres://` with `postgresql+asyncpg://`
4. Set as `DATABASE_URL` in `backend/.env`

### Upstash (Redis)
1. Create a Redis database at [upstash.com](https://upstash.com)
2. Copy the **Redis URL** from the dashboard
3. Set as `REDIS_URL` in `backend/.env`

### Google OAuth2
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
3. Set Authorized Redirect URI: `http://localhost:8000/api/v1/auth/google/callback`
4. Copy Client ID and Secret to `backend/.env`

### Resend (Email)
1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/month)
2. Create an API key → set as `RESEND_API_KEY`

### SSLCommerz (Payments)
1. Register at [developer.sslcommerz.com](https://developer.sslcommerz.com)
2. Use sandbox credentials for development
3. Set `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD`

---

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## User Roles

| Role | Capabilities |
|---|---|
| **Attendee** | Browse events, book tickets, view own tickets |
| **Organizer** | Create/manage events, venues, view analytics, manage staff |
| **Admin** | Approve organizer requests, manage all users |

> New users register as **Attendees**. To become an Organizer, submit a request from your profile — an Admin will approve it.

---

## Milestone Progress

- 🟡 **30%** — Auth, Event CRUD, Venue management, Deployment pipeline
- 🟠 **70%** — Real-time seat booking, Payments, QR check-in, Email automation
- 🟢 **100%** — Analytics dashboard, Resource management, Selenium tests, Full polish

---

## Running Tests

```bash
# Backend unit tests (Pytest)
cd backend
pytest tests/ -v

# Selenium E2E tests
cd backend/tests/selenium
python test_booking_flow.py
```

---

## Deployment

| Service | Platform | Environment Variable |
|---|---|---|
| Frontend | Vercel | Set `VITE_API_URL` to Render backend URL |
| Backend | Render | Set all backend env vars |
| Database | Supabase | — |
| Redis | Upstash | — |
