# Ascent

Ascent is a mobile-first personal growth and goal execution platform. The repository now includes a real backend and authenticated browser workflow, with the project boundary intentionally documented as an incremental, production-leaning starting point rather than a full product.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```env
PORT=3000
JWT_SECRET=change-me-in-production
```

3. Start the app:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## Architecture

- Express serves the UI and API.
- SQLite stores users, goals, milestones, and same-day action completions.
- JWT auth secures `/api/*` routes.
- Browser UI calls the API for registration, login, goal creation, completion, milestone updates, and recovery actions.

## Current scope

This repository now supports:

- account registration and login
- authenticated goal creation
- milestone tracking
- daily action completion with safe duplicate prevention
- pause/resume/abandon workflow
- minimum-action recovery pattern

It does not yet include the full Ascent feature set such as AI coaching, memory, routines, discovery, or course systems.

## Testing

```bash
npm test
```

The included tests cover:

- user registration and isolation
- duplicate action completion safety
- unauthorized access rejection

## Production notes

- Replace the development JWT secret before any real deployment.
- SQLite is suitable for the current milestone but is not a production-scale multi-user database in a long-term system.
- Continue to add deployment, monitoring, CI, and full Ascent experience features in subsequent milestones.
