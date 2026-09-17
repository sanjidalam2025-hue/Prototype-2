# Ascent — Base44 Dev Notes

## Stack
Node.js (ESM) + Express single server. Serves the static UI (`index.html`, `app.js`, `styles.css`) and the `/api/*` JSON API on one port (3000). SQLite via `better-sqlite3` (native module) stored in `./data/ascent.sqlite`. JWT auth via cookies + bearer tokens.

## Run
`docker compose -f docker-compose.base44.yml up -d` — uses `node:22-bookworm-slim`, bind-mounts the repo, runs `npm install && npm run dev` (`node --watch server.js`, live reload on file changes). Port 3000 is the only public port (single-origin).

## Secrets
- `JWT_SECRET` — signs JWT auth tokens. A generated development placeholder is in `/run/base44/app.env`; replace with a real value for any non-dev use. Defaults to `dev-secret-change-me` if absent.

## Gotcha
The `profiles` table has a column named `values`, which is a SQLite reserved keyword. It must be quoted as `"values"` in all DDL/DML (CREATE TABLE, INSERT, UPDATE). It was unquoted originally and crashed on boot — fixed in `server.js`.

## Verify
- `curl localhost:3000/api/health` → `{"ok":true,...}`
- `docker compose -f docker-compose.base44.yml exec -T web npm test` → 5 tests pass.
- Register/login via the UI, then create goals and milestones to exercise the API.
