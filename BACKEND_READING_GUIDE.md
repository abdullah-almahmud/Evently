# Evently Backend Reading & Learning Guide

This guide focuses on the Python backend in `backend/`. It is written for someone who already knows Python and wants to understand the backend rather than read files in arbitrary order.

> **Repository snapshot:** the default branch is `30percent`. This guide describes the code currently in that branch. The README describes features planned for later milestones, so treat source code—not a feature list—as proof that something is implemented.

## 1. What the backend does

Evently is a campus event and ticketing application. Its backend exposes a versioned HTTP API for authentication, events, venues, bookings, tickets, payments, check-in, and administration. It stores relational data in PostgreSQL, uses Redis for seat/tier holds and event messages, and has integrations for Google OAuth, email, and SSLCommerz payments.

The main execution path is:

```text
HTTP request
  -> FastAPI route in app/api/v1/
  -> dependency injection (auth, database session)
  -> Pydantic request/response schemas
  -> SQLAlchemy models and async database session
  -> PostgreSQL, Redis, or an external service
  -> response serialized by FastAPI/Pydantic
```

Start with a single complete path—authentication or bookings—and follow imports in both directions. That gives you the project's conventions before you explore every feature.

## 2. Backend technology stack

| Concern | Technology in this repo | What to learn |
|---|---|---|
| Language/runtime | Python 3.12+; asynchronous functions; Uvicorn | `async`/`await`, ASGI, Python imports and packages |
| HTTP API | FastAPI | routers, path/query/body parameters, dependency injection, HTTP exceptions, OpenAPI docs |
| Input/output validation | Pydantic v2 and `pydantic-settings` | `BaseModel`, field types, validation, `model_validate`, settings from environment |
| ORM/database | SQLAlchemy 2.0 async + `asyncpg` | declarative models, relationships, `select`, `AsyncSession`, transactions, eager loading |
| Database | PostgreSQL (README documents Supabase hosting) | tables, foreign keys, indexes, constraints, transactions, UUIDs, enums |
| Schema changes | Alembic | migration revisions, `upgrade`/`downgrade`, revision chains |
| Short-lived holds/cache | Redis async client | keys, TTL, atomic `SET NX EX`, Lua scripts, Pub/Sub |
| Authentication | JWT (`python-jose`) + bcrypt; Google OAuth via Authlib | bearer tokens, claims and expiry, password hashing, OAuth authorization-code flow |
| Integrations | Resend, SSLCommerz over `httpx`, QR codes via `qrcode`/Pillow | external API calls, callbacks/IPNs, error handling, secrets |
| Real-time | FastAPI WebSocket endpoint; Redis publish helper | WebSocket lifecycle and Pub/Sub; check the current implementation before assuming broadcasts work |

The exact Python dependencies and pinned versions are in [`backend/requirements.txt`](backend/requirements.txt). Frontend tools are not needed to begin backend learning.

## 3. Where the backend code is

```text
backend/
├── .env.example             # Example configuration names; use your own local values
├── requirements.txt         # Python dependencies and pinned versions
├── alembic.ini              # Alembic configuration
├── alembic/
│   ├── env.py               # Connects Alembic to app settings and model metadata
│   └── versions/            # Ordered database schema migrations
└── app/
    ├── main.py              # FastAPI app, lifecycle, CORS, API mount, health check
    ├── api/v1/
    │   ├── router.py        # Combines route modules under /api/v1
    │   ├── auth.py          # Register, login, refresh, Google OAuth
    │   ├── users.py         # User profile and user-facing operations
    │   ├── events.py        # Event endpoints
    │   ├── venues.py        # Venue endpoints
    │   ├── bookings.py      # Booking endpoints and substantial booking workflow logic
    │   ├── tickets.py       # Ticket endpoints
    │   ├── payments.py     # Payment initiation/callback endpoints
    │   ├── checkin.py       # Ticket check-in endpoints
    │   ├── analytics.py    # Analytics endpoints
    │   ├── admin.py        # Administrator operations
    │   ├── staff.py        # Event-staff operations
    │   └── websocket_routes.py # WebSocket endpoint
    ├── core/
    │   ├── config.py        # Environment-backed Settings and URL normalization
    │   ├── database.py      # Async engine, session factory, Base, get_db dependency
    │   ├── deps.py          # Current-user and role authorization dependencies
    │   ├── security.py      # Password hashing and JWT helpers
    │   ├── redis.py         # Redis client, seat/tier holds, Pub/Sub publishing
    │   ├── seating.py       # Pure helpers for seat labels/sections
    │   └── seed_venues.py   # Default venue data setup
    ├── models/              # SQLAlchemy entities and relationships
    ├── schemas/             # Pydantic request/response contracts
    └── services/            # Reusable workflows/integrations (booking, email, payment, QR)
```

### Learn the layers

- **`api/v1/` — HTTP boundary.** Find the route decorator (`@router.get`, `@router.post`, etc.). Read the function signature: FastAPI gets request bodies from Pydantic models and resolves values such as `current_user` and `db` from `Depends(...)`.
- **`schemas/` — API contract.** These describe accepted request data and response shape. For example, `schemas/booking.py` defines `BookingCreate` and `BookingResponse`.
- **`models/` — database shape.** These are SQLAlchemy mappings, not API payload classes. `models/booking.py` maps `Booking` and `BookingItem` tables and relationships.
- **`core/` — shared infrastructure.** Configuration, sessions, authentication dependencies, security helpers, and Redis live here.
- **`services/` — integrations and reusable operations.** Read these for calls to email/payment providers and supporting workflows. Do not assume every route delegates all business logic to a service: `api/v1/bookings.py` itself contains a large booking workflow, while `services/booking_service.py` also has booking-related functions. Trace callers to understand which path is actually used.
- **`alembic/versions/` — database history.** A migration changes deployed database schema. Read `revision` and `down_revision`, then `upgrade()` and `downgrade()`.

## 4. A practical reading order

### Pass 1 — Get oriented

1. Read this guide and the project README's backend setup and environment sections.
2. Open `backend/requirements.txt`; make a short glossary for unfamiliar libraries.
3. Read `backend/.env.example` and `app/core/config.py`. Record which settings are required, which have defaults, and which are secrets.
4. Read `app/main.py` and `app/api/v1/router.py`. Draw the route mounting chain: `main.py` includes the v1 router at `/api/v1`, and the router adds feature prefixes.

### Pass 2 — Understand the request mechanics

Read these files in order:

1. `app/core/database.py` — how the async engine and per-request `AsyncSession` are provided.
2. `app/core/deps.py` — how bearer tokens become a `User`, and how role checks are applied.
3. `app/core/security.py` — password hashing and token creation/decoding.
4. `app/schemas/auth.py` and `app/api/v1/auth.py` — follow a registration or login request from validation to database commit to token response.

For every unfamiliar FastAPI parameter, ask: **Where does this value come from?** For example, `Depends(get_db)` is a dependency, not a value supplied by the caller in JSON.

### Pass 3 — Learn the data model

Read `app/models/__init__.py` first to see shared enums/exports and the models registered for Alembic. Then inspect the domain in this order:

1. `user.py` — accounts and roles.
2. `venue.py` and `event.py` — event ownership, venues, ticket tiers, and relationships.
3. `booking.py` — bookings and line items.
4. `ticket.py` and `payment.py` — issued tickets and payment records.
5. `seat.py`, `staff.py`, `resource.py`, `volunteer.py`, and `waitlist.py` — additional event features.

For each model, write down its table name, primary key, foreign keys, nullable fields, enum fields, and relationships. Sketch a small entity-relationship diagram; do not try to memorize every column on the first pass.

### Pass 4 — Trace one feature end to end

Use **booking** as a full-stack backend exercise:

1. `schemas/booking.py`: What can the client submit, and what does it receive?
2. `api/v1/bookings.py`: How is the user authenticated? Which validations reject a request? Which rows are read or changed?
3. `models/event.py`, `models/booking.py`, `models/seat.py`, and `models/ticket.py`: Which persisted objects are involved?
4. `core/redis.py` and `services/booking_service.py`: How are temporary seat holds and ticket-confirmation helpers implemented?
5. `services/payment_service.py` and `api/v1/payments.py`: How does paid booking interact with the payment gateway?
6. `alembic/versions/`: Which schema changes support these entities?

Draw the state changes on paper: event/tier availability, booking status, booking items, seats/holds, payment, tickets. This makes async database code much easier to understand.

### Pass 5 — Explore remaining features

After one path makes sense, repeat the same method for event creation (`events.py` + event schemas/models), authentication (`auth.py` + `security.py` + `deps.py`), and ticket scanning (`checkin.py` + ticket model/security helpers). Then inspect admin, staff, analytics, venue, email, and QR flows as needed.

## 5. How to read an individual endpoint

For each route, answer these questions in a small note:

1. **Route:** What HTTP method and URL does the decorator define? Add the `/api/v1` and router prefixes.
2. **Inputs:** Which path/query/body parameters are accepted? Which Pydantic schema validates the body?
3. **Identity/permissions:** Which `Depends(...)` functions run? Is a role required?
4. **Rules:** What conditions cause an `HTTPException`, and with which status code?
5. **Data:** Which models and SQLAlchemy statements are used? Is there a commit, flush, rollback, or row lock?
6. **Side effects:** Does it call Redis, email, payments, OAuth, or another API?
7. **Output:** Which `response_model` is returned, and how is it constructed?
8. **Failure/concurrency:** What happens if an external service fails or two users act at once?

This is a good way to use AI as a tutor: ask it to explain one function at a time, then verify every claim against the imports, called functions, schema, and model. Ask it to distinguish what the code does now from comments describing intended behavior.

## 6. Python concepts to learn in this codebase

Since you already know Python, prioritize the concepts that are specific to this backend:

- **Async I/O:** `async def`, `await`, async context managers, and why database/network calls are awaited.
- **Type hints:** `Optional`, `List`, `Dict`, `UUID`, unions, and return annotations. These aid validation and tooling; they do not themselves make Python statically typed.
- **Dependency injection:** FastAPI's `Depends`, especially `get_db`, `get_current_active_user`, and `require_role`.
- **Pydantic:** model validation and serialization, separate request/response models, `ConfigDict(from_attributes=True)`.
- **SQLAlchemy 2 async:** `select(...)`, `await db.execute(...)`, result/scalar methods, relationships, `selectinload`, `flush`, `commit`, `rollback`, and `with_for_update()`.
- **Transactions and concurrency:** what must be atomic, when a transaction is committed, and the difference between a Redis TTL hold and a database booking.
- **JWT/OAuth:** signed claims and expiry are different from encrypted data; understand the OAuth redirect/callback flow.
- **Migrations:** why model edits and database migrations are separate changes.

## 7. Run the backend locally

The README documents Python 3.12+, PostgreSQL (or a Supabase URL), and Redis (or an Upstash URL). From the repository root:

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # On Windows, use: copy .env.example .env
# Edit .env with your own database, Redis, and optional integration settings
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Then visit `http://localhost:8000/docs` for Swagger UI or `http://localhost:8000/redoc` for ReDoc. `GET /` is a health check.

**Secrets:** never commit a real `.env`, passwords, API keys, OAuth client secret, or payment credentials. Use sandbox credentials for payment development. The example/default values are for setup and local development, not production security.

## 8. Important implementation notes to verify while learning

These are useful distinctions between documentation and the checked-in source:

- The README lists `pytest tests/ -v` and a Selenium test command, but this repository snapshot has **no `backend/tests/` directory**, and `pytest` is not listed in `requirements.txt`. Do not assume those test commands work without adding/configuring the tests and test dependencies.
- `app/main.py` calls `Base.metadata.create_all` during startup, while Alembic migrations also exist. Learn the difference: `create_all` creates missing tables from current model metadata; Alembic records and applies explicit schema revisions. Check which approach is intended for each environment before changing database setup.
- `services/booking_service.py` and `api/v1/bookings.py` both contain booking-related logic. Follow actual imports/call sites before assuming one is the sole implementation.
- `core/redis.py` has a Redis Pub/Sub publisher, but `api/v1/websocket_routes.py` currently accepts a socket, sends a connection message, then echoes messages. Its docstring says full multi-client seat synchronization is planned; do not treat the current route as a complete broadcast implementation.
- The README lists more completed/planned capabilities than a directory name or comment can prove. For a feature, find the live route, implementation, and any tests before considering it implemented.

## 9. A sustainable line-by-line routine

Do not try to understand the whole repository in one sitting. For one file or function at a time:

1. Read the file once without stopping; note its role.
2. List imports and classify them as standard library, third-party, or project modules.
3. Read the public functions/classes and follow each project-local call to its definition.
4. For SQL, translate each statement into plain English and identify affected tables.
5. For each `await`, name the I/O operation being waited on.
6. Write a three-to-five sentence explanation in your own words.
7. Run the relevant endpoint or docs locally, if the required services are configured.
8. Revisit comments and compare them with actual code paths.

Keep a glossary and diagrams in your own notes. Understanding a line means understanding its role in the flow, not memorizing its syntax.

## 10. Useful follow-up questions

- “Walk me through `get_current_user` in `app/core/deps.py` and show how an endpoint uses it.”
- “Trace a booking request through `app/api/v1/bookings.py`, its schemas, models, and database writes.”
- “Compare the booking code in `app/api/v1/bookings.py` and `app/services/booking_service.py`; which functions are called by current routes?”
