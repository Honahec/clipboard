# Clipboard

Clipboard is a full-stack clipboard sharing tool. The frontend is a React + TypeScript application styled with Chakra UI, and the backend is a FastAPI service backed by SQLAlchemy. It lets anyone create short-lived public notes and signed-in users keep personal entries that stay private.

## Project Structure
- `frontend/` React client built with Vite and React Query
- `backend/` FastAPI application with PostgreSQL via SQLAlchemy

## Prerequisites
- Node.js 18+ and pnpm (or npm) for the frontend
- Python 3.11+ and access to a PostgreSQL instance for the backend

## Backend Setup
1. Create and activate a virtual environment.
2. Install dependencies: `pip install -r backend/requirements.txt`.
3. Create `backend/.env` (optional) and define any overrides for the settings in `app/core/config.py`, especially `DATABASE_URL`.
4. Launch the API: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` (run from `backend`).
5. Browse API docs at `http://localhost:8000/docs`.

## Frontend Setup
1. Install dependencies: `pnpm install` (run from `frontend`).
2. (Optional) Adjust API and OAuth2 endpoints in `src/config.ts`.
3. Start the dev server: `pnpm dev`.
4. Open the client at the URL Vite prints (default `http://localhost:5173`).

--- 

Welcome Stars and PRs