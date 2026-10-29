# ZoneGuard frontend

This directory contains the React/Vite investigation console and its optional
Express proxy. The proxy forwards ZoneGuard API requests to the FastAPI
backend and hosts the built frontend in production.

## Configuration

Copy `.env.example` to `.env` and set `ZONEGUARD_BACKEND_URL` to the FastAPI
base URL. Set `GEMINI_API_KEY` only when using the server-side Copilot route;
never commit `.env`.

## Run locally

Prerequisite: Node.js 20 or newer.

```powershell
npm install
npm run lint
npm run build
npm run dev
```

The default frontend port is `3000`. The FastAPI backend defaults to `8080`;
run it from the repository root as described in the root README.
