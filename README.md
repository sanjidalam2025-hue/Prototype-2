# Ascent

Ascent is a mobile-first personal goal execution MVP. It currently provides a real browser-based goal workflow with local persistence:

- Create goals with milestones and a daily action.
- Mark daily actions complete without duplicate completions.
- Track goal progress from milestone state.
- Pause, resume, and abandon goals while preserving history.
- Recover a missed action with a smaller next action.
- Export and import user data for backup.

## Current limitation

This repository contains a static MVP. It has no server, account system, database, AI provider, or cross-device synchronization yet. Data is stored in the browser's local storage and is explicitly labeled as local in the UI. No feature claims remote persistence or AI behavior that is not implemented.

## Run locally

Serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Opening `index.html` directly also works in modern browsers, although a local server is recommended for development.

## Files

- `index.html` — accessible application shell and forms.
- `styles.css` — responsive, reduced-motion-friendly styling.
- `app.js` — validated local domain state and UI behavior.
- `PROJECT_STATUS.md` — current implementation and remaining production work.

## Production roadmap

The next production milestone is to move the domain operations behind an authenticated API and database, then add server-side ownership checks, migration tests, and end-to-end tests. AI coaching should be added only after bounded context retrieval and structured-output validation are available.
