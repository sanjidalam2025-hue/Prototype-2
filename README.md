# Ascent

Ascent is a mobile-first personal growth and goal execution app. This repository now includes a minimal production-style foundation built on a real backend and SQLite database, while still remaining intentionally small and honest about the remaining work.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the API and static app:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

## Environment

Create a `.env` file with, at minimum:

```env
PORT=3000
JWT_SECRET=change-me-in-production
```

A sample file is available in `.env.example`.

## Key architecture

- Express server serves static UI files and exposes `/api/*` endpoints.
- SQLite database stores users, goals, milestones, and same-day action completions.
- JWT-based auth protects all goal and user operations.
- Goal ownership is enforced in every database query.

## Honesty boundary

This is not yet the full Ascent product. It does not include AI coaching, discovery, routines, learning, notifications, or deployment configuration. It is a functioning backend foundation and a local web app shell that can be extended safely.

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/goals`
- `POST /api/goals`
- `PATCH /api/goals/:goalId`
- `POST /api/goals/:goalId/complete`
- `PATCH /api/goals/:goalId/milestones/:milestoneId`
- `POST /api/goals/:goalId/recover`

## Production notes

- The JWT secret must be set in a real environment.
- The app currently uses SQLite for local persistence and should be migrated to a managed production database before public deployment.
- Do not treat this as a true multi-user production system until tests, deployment config, and auth UI integration are added.
