# Ascent

Ascent is a mobile-first personal growth and goal execution platform. The repository now includes a real authenticated backend with a basic user discovery profile and working goal-management flow.

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
- SQLite stores users, profiles, goals, milestones, and action completions.
- JWT auth secures `/api/*` routes.
- Browser UI calls the API for registration, login, profile setup, goals, and completion tracking.

## Current scope

This repository now supports:

- account registration and login
- authenticated goal creation
- milestone tracking
- daily action completion with safe duplicate prevention
- pause/resume/abandon workflow
- minimum-action recovery pattern
- discovery profile for values, strengths, barriers, and dream

It does not yet include the complete Ascent product, including AI coaching, learning/Routine engines, notifications, or tree visualization.

## Testing

```bash
npm test
```

The included tests cover:

- user registration and retrieval
- profile saving and retrieval
- profile access control
- duplicate action completion safety

## Production notes

- Replace the development JWT secret before any real deployment.
- SQLite is suitable for the current milestone but is not a production-scale multi-user database.
- Continue to add deployment, monitoring, CI, and broader Ascent features in subsequent milestones.
