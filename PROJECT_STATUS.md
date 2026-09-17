# PROJECT_STATUS

Date: 2026-09-17
Repository: sanjidalam2025-hue/Prototype-2
Audit phase: forensic audit completed; no feature implementation performed in this commit.

## A. Actual architecture

The repository is a small Node.js 20-style ESM application:

```text
Browser
  -> index.html + styles.css + app.js
  -> same-origin Express HTTP API
  -> JWT cookie or Bearer token authentication
  -> SQLite via better-sqlite3
```

### Runtime

- `server.js` creates an Express app, opens `data/ascent.sqlite`, creates tables at startup, serves static assets, and starts the HTTP server.
- `package.json` has `start`, `dev`, and Node's built-in `test` scripts.
- `.env.example` documents `PORT` and `JWT_SECRET`.
- There is no separate migration runner, schema directory, CI workflow, lint configuration, type checker, build step, or deployment configuration.

### Persistence

SQLite tables currently created by `server.js`:

- `users`
- `profiles`
- `goals`
- `milestones`
- `action_events`

Foreign-key declarations exist, but SQLite foreign-key enforcement is not explicitly enabled.

### Authentication and authorization

- Registration hashes passwords with `bcryptjs` and issues a seven-day JWT.
- Login verifies the password and issues the same JWT.
- The JWT is stored in an HTTP-only cookie; API clients may also use a Bearer token.
- `requireAuth` verifies the token and resolves the user from the database.
- Goal and profile queries use the authenticated user ID rather than a client-provided owner ID.
- There is no password reset, email verification, account deletion, session revocation, rate limiting, CSRF strategy for cookie-authenticated state changes, or refresh-token/session table.

### Frontend state and critical flows

- `app.js` owns in-memory UI state and treats the API as the persistence source of truth.
- On load it calls `/api/auth/me`, `/api/goals`, and `/api/profile`.
- Authentication, profile creation, goal creation, milestone updates, completion, pause/resume, abandon, and recovery are wired to API calls.
- The frontend escapes user content before inserting most values into HTML.
- The frontend has basic error notices, but some network failures are silently converted into an empty profile or unauthenticated view.

## B. Feature matrix

| Feature | Status | Evidence | Problems | Priority |
| --- | --- | --- | --- | --- |
| Registration/login/logout | PARTIAL | `server.js` auth routes; auth form in `index.html` | No rate limit, reset, verification, revocation, or production secret enforcement | P0 |
| Session persistence | PARTIAL | HTTP-only JWT cookie and `/api/auth/me` | Seven-day bearer-style JWT cannot be revoked; no explicit expiry UX | P1 |
| User isolation | PARTIAL | User-scoped profile and goal queries | No complete cross-resource attack suite; milestones/actions need dedicated tests | P0 |
| Discovery profile | PARTIAL | `profiles` table and `/api/profile` | No onboarding state, resume/skip flow, or structured discovery journey | P1 |
| Dream engine | MISSING | Profile has a free-text `dream` only | No dream/outcome/motivation domain model or selection flow | P1 |
| Goal creation | PARTIAL | `POST /api/goals` and goal form | Server validation is minimal; no deadlines, skills, projects, dependencies, edit UI, or transactions | P1 |
| Milestones | PARTIAL | Milestone table and PATCH endpoint | No duplicate-title validation, completion integrity rules, reorder/delete support, or concurrency tests | P1 |
| Daily actions | PARTIAL | One `action` field and `action_events` table | No ideal/minimum/emergency levels, schedule, timezone, miss detection, or action history response | P1 |
| Progress | BROKEN/PARTIAL | Milestone-derived progress and frontend summary | `serializeGoal` does not return `completedActions`; action progress is therefore not represented correctly in UI responses | P0 |
| Goal closure | PARTIAL | Pause/resume/abandon status updates | No redesign/replace event history; completion endpoint currently does not reject paused/abandoned goals | P0 |
| Recovery | PARTIAL | `/recover` overwrites goal action | Previous action/reason are not preserved in a recovery event; no barrier analysis | P1 |
| AI coach | MISSING | No AI dependency, route, service, prompt, or schema | Entire AI capability absent | P1 |
| AI memory | MISSING | No memory table/service | No retrieval, consent, deduplication, retention, or privacy controls | P1 |
| Learning/course engine | MISSING | No course or skill entities | No learning flow | P1 |
| Routine engine | MISSING | No routine/schedule entities | No timezone-aware planning | P2 |
| Notifications | MISSING | No notification subsystem | No preferences, delivery, deduplication, or closure filtering | P2 |
| Tree system | MISSING | No tree state or renderer | No historical growth model | P2 |
| API validation | PARTIAL | Basic checks in routes | No shared schemas, max-length checks, email validation, content-type policy, or consistent error middleware | P0 |
| Error handling | PARTIAL | Route-level JSON errors and frontend notices | No centralized error handler; database/unexpected exceptions can become generic Express responses; profile load silently hides failures | P1 |
| Async/concurrency | PARTIAL | Unique `(goal_id, day_key)` constraint | Completion checks then inserts without handling a uniqueness race; frontend buttons are not disabled during mutations | P1 |
| Accessibility | PARTIAL | Labels, semantic sections, `role=status`, focus styles, reduced-motion CSS | No automated accessibility checks, focus restoration, field-level error association, or full keyboard/screen-reader audit | P2 |
| Mobile UI | PARTIAL | Responsive CSS breakpoint and touch-sized buttons | No actual device/browser evidence; prompt-based recovery is poor on mobile and lacks accessible dialog semantics | P2 |
| Tests | PARTIAL | Node tests in `tests/*.test.js` | Tests use a shared persistent DB, no cleanup/isolation, and do not cover validation, ownership mutation attacks, paused completion, or concurrency | P0 |
| Build/deployment | MISSING | Start script only | No CI, production build/check, process health strategy, persistent database deployment, backups, or observability | P0 |
| Documentation | PARTIAL | `README.md`, `.env.example`, this file | No architecture, database, deployment, or AI architecture documents | P2 |

## C. Bug inventory

### Functional

#### AUDIT-F-001 — Action completion count is absent from serialized goals

- Location: `server.js`, `serializeGoal()`; `app.js`, `updateSummary()`.
- Reproduction: Create a goal, call `POST /api/goals/:goalId/complete`, then inspect the returned goal or refresh the UI.
- Expected: The goal response and progress summary include the persisted completed-action count.
- Actual: `serializeGoal()` returns milestone counts and progress but no `completedActions`; the frontend falls back to zero.
- Root cause: Action-event aggregation was not included in the response contract.
- Severity: P0 for progress correctness.
- Proposed fix: Aggregate action events in a user-scoped query and define whether progress is milestone-based, action-based, or a documented combination.
- Regression test: Complete an action, retrieve goals, assert the count and summary are nonzero.

#### AUDIT-F-002 — Paused and abandoned goals can receive completions

- Location: `server.js`, `POST /api/goals/:goalId/complete`.
- Reproduction: Create a goal, pause or abandon it through `PATCH`, then call the completion endpoint directly with valid authentication.
- Expected: Completion is rejected because inactive goals must not generate or accept daily actions.
- Actual: The route checks ownership but not `goal.status`.
- Root cause: Status rules are enforced in the UI only, not the service boundary.
- Severity: P0 data-integrity/product-consistency issue.
- Proposed fix: Reject non-active goals with a conflict response and add tests.
- Regression test: Assert paused and abandoned completion requests return 409 and create no event.

#### AUDIT-F-003 — Recovery overwrites the current action without preserving history

- Location: `server.js`, `/api/goals/:goalId/recover`.
- Reproduction: Recover a goal, then inspect its prior action or attempt to audit why it changed.
- Expected: Previous action, reason, replacement action, and timestamp are retained.
- Actual: The action string is overwritten with `Minimum version: ...`.
- Root cause: No recovery-event model exists.
- Severity: P1.
- Proposed fix: Add append-only recovery events and update the current action transactionally.
- Regression test: Assert recovery creates an event containing both old and new actions.

### Validation/API

#### AUDIT-A-001 — Weak server-side input validation

- Location: `server.js`, auth, profile, goal, and update routes.
- Reproduction: Submit malformed email, whitespace-only title/action, oversized strings, non-string milestone values, or invalid JSON shapes.
- Expected: Clear 4xx responses with bounded, normalized inputs.
- Actual: Email only needs to be non-empty; goal updates can write empty title/action; max lengths are mostly client-only; profile fields have no server-side length limits.
- Root cause: Validation is distributed and incomplete.
- Severity: P0/P1 depending on field.
- Proposed fix: Add shared validation functions or schema validation and enforce limits at every write boundary.
- Regression test: Invalid email, empty updates, oversized fields, and malformed arrays.

#### AUDIT-A-002 — Unexpected database errors have no safe centralized response

- Location: `server.js` all routes.
- Reproduction: Cause a constraint/database failure or malformed request that reaches a throwing operation.
- Expected: Stable JSON error, safe logging, and no internal details.
- Actual: There is no application error middleware or structured error boundary.
- Root cause: Route handlers rely on default Express behavior.
- Severity: P1.
- Proposed fix: Add centralized API error middleware and safe request correlation logging.
- Regression test: Simulated database failure returns a controlled 500 JSON response.

### Authentication/security

#### AUDIT-S-001 — Insecure fallback JWT secret

- Location: `server.js`, `const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'`.
- Reproduction: Start with `NODE_ENV=production` and no `JWT_SECRET`.
- Expected: Startup fails safely.
- Actual: Tokens are signed with a known development secret.
- Root cause: Development convenience fallback is active in all environments.
- Severity: P0.
- Proposed fix: Require a strong secret in production; fail startup when absent or too short; document secret rotation.
- Regression test: Production-mode import/start without secret fails.

#### AUDIT-S-002 — No brute-force protection on authentication

- Location: `/api/auth/login` and `/api/auth/register`.
- Reproduction: Send repeated credential attempts.
- Expected: Rate limiting and safe abuse controls.
- Actual: Unlimited attempts are accepted by the application layer.
- Root cause: No rate-limiting dependency or middleware.
- Severity: P1.
- Proposed fix: Add route-scoped rate limiting and generic authentication errors.
- Regression test: Exceed configured limit and assert 429.

#### AUDIT-S-003 — Cookie-authenticated state changes have no explicit CSRF strategy

- Location: cookie authentication plus POST/PATCH routes.
- Reproduction: A browser with a valid cookie is induced to submit a cross-site state-changing request.
- Expected: Cross-site request is rejected or protected by a documented same-site/CSRF mechanism.
- Actual: SameSite=Lax is present, but no explicit CSRF token/origin policy is implemented.
- Root cause: Cookie authentication was added without threat-model documentation.
- Severity: P1.
- Proposed fix: Add CSRF protection or enforce strict Origin/Referer checks for cookie-authenticated mutations; document Bearer-only API alternative.
- Regression test: Cross-origin mutation without protection is rejected.

### Database/data integrity

#### AUDIT-D-001 — SQLite foreign-key enforcement is not enabled

- Location: database initialization after `new Database(...)`.
- Reproduction: Attempt an orphan insert directly or through a future route.
- Expected: Foreign-key constraints prevent orphan records.
- Actual: SQLite commonly leaves foreign-key enforcement disabled unless `PRAGMA foreign_keys = ON` is set per connection.
- Root cause: Schema declarations were added without connection enforcement.
- Severity: P0.
- Proposed fix: Enable the pragma immediately after opening the database and add integrity checks.
- Regression test: Orphan milestone/profile insert is rejected.

#### AUDIT-D-002 — Schema creation is not a migration system

- Location: `server.js` startup `CREATE TABLE IF NOT EXISTS` block.
- Reproduction: Change a schema definition after data exists and restart.
- Expected: Versioned, reviewable, reversible migration behavior.
- Actual: Existing tables are not altered and schema drift is not detected.
- Root cause: Bootstrap DDL is being used as migration management.
- Severity: P1.
- Proposed fix: Add a migration table and numbered migrations; do not perform destructive changes without backup/rollback.
- Regression test: Fresh and upgraded database migration tests.

#### AUDIT-D-003 — Goal creation is not atomic across goal and milestones

- Location: `POST /api/goals`.
- Reproduction: Force a milestone insert failure after the goal insert succeeds.
- Expected: Goal and its requested milestones commit together or neither commits.
- Actual: Goal is inserted first and milestone inserts run separately without a transaction.
- Root cause: Multi-write operation is not wrapped in `db.transaction`.
- Severity: P1.
- Proposed fix: Use a transaction for goal plus milestone creation.
- Regression test: Inject a milestone failure and assert no orphan/partial goal remains.

### Authorization

#### AUDIT-Z-001 — Mutation authorization coverage is incomplete

- Location: goal update, completion, milestone update, recovery routes and test suite.
- Reproduction: User A sends User B's goal/milestone ID to every mutation endpoint.
- Expected: All cross-user requests return not found/forbidden without changing data.
- Actual: Queries appear user-scoped for the goal, but dedicated tests do not prove every mutation path and milestone ownership combination.
- Root cause: Authorization was implemented but not comprehensively regression-tested.
- Severity: P0 until verified.
- Proposed fix: Add a matrix of cross-user read/update/complete/recover/milestone tests.
- Regression test: User A attempts every User B resource mutation and then verifies User B's data.

### State/async/reliability

#### AUDIT-R-001 — Frontend silently treats profile failures as no profile

- Location: `app.js`, `loadProfile()`.
- Reproduction: Make `/api/profile` return 500 or simulate a network failure after login.
- Expected: User sees an error and can retry; existing state is not misrepresented.
- Actual: Any error sets `state.profile = null`, which displays the empty profile form.
- Root cause: Error and empty states are conflated.
- Severity: P1.
- Proposed fix: Track loading/error/empty separately and add a retry action.
- Regression test: Simulated profile failure renders an error state.

#### AUDIT-R-002 — Mutating buttons are not disabled during requests

- Location: `app.js` completion, milestone, goal status, recovery, and goal creation handlers.
- Reproduction: Double-click or rapidly activate a mutation control.
- Expected: UI prevents duplicate in-flight requests and reconciles stale responses.
- Actual: The server protects same-day completion with a unique constraint, but other requests can be duplicated or arrive out of order; controls remain enabled.
- Root cause: No per-operation pending state or abort/cancellation strategy.
- Severity: P1.
- Proposed fix: Add request-state guards and always re-fetch or reconcile authoritative resource state after mutation.
- Regression test: Rapid UI actions and out-of-order response simulation.

### Testing/operations

#### AUDIT-T-001 — Tests share a persistent database and lack cleanup/isolation

- Location: `tests/*.test.js`, imported singleton `db`.
- Reproduction: Run tests repeatedly or in parallel with an existing `data/ascent.sqlite`.
- Expected: Deterministic isolated test database.
- Actual: Tests use the application database path and only randomize emails; data accumulates and test order/environment can affect results.
- Root cause: No test database configuration or teardown.
- Severity: P0 for release confidence.
- Proposed fix: Use a test-specific database path/connection, reset schema per test suite, and close the DB cleanly.
- Regression test: Run tests twice against a clean temporary database and assert identical results.

#### AUDIT-T-002 — Required verification cannot currently be evidenced from repository inspection

- Location: repository tooling.
- Reproduction: Inspect package scripts and available project files.
- Expected: CI runs install, tests, lint/type/build checks.
- Actual: Only `npm test`, `npm start`, and `npm run dev` exist; no CI, lint, typecheck, browser E2E, or production build exists.
- Root cause: Minimal prototype tooling only.
- Severity: P0 for production readiness.
- Proposed fix: Add CI and appropriate checks after stabilizing the API.
- Regression test: Required CI workflow passes on every change.

## D. Security and data risks

- Production can silently use a publicly known JWT secret.
- Cookie-based state changes lack an explicit CSRF defense.
- Authentication endpoints have no brute-force rate limit.
- SQLite foreign keys are declared but not explicitly enforced.
- The database has no versioned migrations, backup/restore process, or integrity-check command.
- Profile and goal writes can accept unbounded server-side strings relative to the product contract.
- User isolation is plausible in current SQL but not fully proven by tests across all mutation routes.
- AI, memory, course, notification, and file-upload risks are not currently active because those systems do not exist; they must not be represented as implemented.

## E. Priority summary

### P0

1. Require a production JWT secret and remove the known fallback in production.
2. Enforce SQLite foreign keys.
3. Reject completion for paused/abandoned goals.
4. Correct action-count/progress response semantics.
5. Complete cross-user authorization tests for every resource mutation.
6. Isolate tests from the development database and add deterministic cleanup.
7. Add server-side validation for auth and goal writes.
8. Add CI/release verification before claiming deployability.

### P1

1. Add centralized error handling and safe structured logging.
2. Add authentication rate limiting and a CSRF/origin strategy.
3. Make goal creation transactional.
4. Add versioned migrations.
5. Preserve recovery history instead of overwriting it.
6. Add explicit frontend loading/error/retry states and mutation guards.
7. Add onboarding state and a real dream/outcome selection flow.
8. Design daily actions with timezone-aware scheduling and ideal/minimum/emergency levels.

### P2

1. Accessibility automation and full keyboard/screen-reader review.
2. Device/browser matrix and mobile performance testing.
3. Deployment/observability documentation and backup tooling.
4. Learning, routines, notifications, tree, AI coach, and memory after the P0/P1 foundation is stable.

## F. Recommended implementation order

1. **Security and integrity hardening:** secret enforcement, foreign keys, validation, inactive-goal completion guard, safe errors.
2. **Test reliability:** isolated test database, complete authorization matrix, regression tests for each P0.
3. **Persistence reliability:** transactions and versioned migrations.
4. **Frontend reliability:** explicit loading/error/retry states, disabled mutation controls, authoritative refresh.
5. **Discovery/dream milestone:** onboarding completion state, dream/motivation/outcome model, user-controlled goal selection.
6. **Execution/recovery milestone:** daily action levels, schedules/timezone handling, append-only recovery events.
7. **Production operations:** CI, deployment, managed database, backups, structured logs, health checks.
8. **AI milestone:** server-side provider adapter, bounded retrieval, schema validation, timeouts, retries, rate/cost limits, and safe fallback.
9. **Learning/routines/notifications/tree:** implement only with shared authoritative goal/progress state and tests.

## G. Audit conclusion

The repository contains a functioning authenticated goal/profile prototype, not a production-ready Ascent platform. The strongest existing foundation is the server-side ownership pattern and same-day uniqueness constraint. The most urgent verified problems are production secret handling, incomplete validation/integrity enforcement, inaccurate action progress representation, inactive-goal completion, weak test isolation, and missing operational verification.

No code feature implementation was performed as part of this audit. The next instruction should approve the highest-priority hardening milestone, beginning with the P0 security, integrity, and test-isolation items above.

## Verification limitation

This audit used repository inspection only. A local dependency install, test run, lint run, production build, browser test, and deployment test were not available in this session; those results must be recorded after running them in a local or CI environment.
