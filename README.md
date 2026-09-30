# Team Fridays

A real-time web app for informal Friday team meetings — no accounts, no
database, just a room code. Eleven activities: Icebreaker Question, This or
That, Two Truths and a Lie, How Many of Us?, Whose Fact Is This?, Herd
Mentality, Caption Battle, Undercover, Wavelength, Snowball Fight, and
Territory Paint.

## Run locally

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- Server: http://localhost:3001

Open the web app, create a room as the host, then open the invite link in other
browser windows (or on your phone) to join as participants.

Configuration lives in `apps/server/.env` (copy from `.env.example`): port, CORS
origin, room TTL, and the disconnect grace period.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Server + web app in watch mode                  |
| `npm test`          | Server unit tests (room lifecycle + activities) |
| `npm run typecheck` | Strict TypeScript across all workspaces         |
| `npm run lint`      | ESLint                                          |
| `npm run build`     | Production build of the web app (`apps/web/dist`, served by the server if present) |

## Architecture

- `packages/shared` — TypeScript types for every socket event, activity view,
  and action, plus Zod schemas and built-in question lists. Both sides import
  from here; there are no untyped string events.
- `apps/server` — Node + Socket.IO. In-memory `RoomStore` behind an interface.
  The server is the single source of truth: clients only ever receive
  **per-participant snapshots**, so hidden information (unrevealed answers, the
  lie in Two Truths) never reaches a browser early.
- `apps/web` — Vue 3 + Pinia + Vite. All styling flows through design tokens.

### Session resilience

Joining stores a `sessionId` in `localStorage` per room. Refreshes and short
disconnects silently restore the same participant (and host role). Disconnected
participants are kept for a 2-minute grace period; if the host is gone longer,
the earliest-joined connected participant is promoted automatically. Wherever
the room waits on submissions, the host sees an N/M counter and can
force-advance.

## How to add a new activity

1. **Shared contracts** — in `packages/shared/src/types.ts`, add the activity
   to `ActivityType`, and define its config, action(s) (namespaced kinds like
   `'my-activity/do-thing'`), and view types. Add Zod schemas for the config and
   actions in `validation.ts`.
2. **Server module** — create `apps/server/src/activities/myActivity.ts`
   implementing `ActivityDefinition`: `create` (initial state), `action`
   (validate + mutate, with `requireHost`/`requireActive`), and `view`
   (the per-participant projection — redact anything not yet revealed).
   Register it in `activities/registry.ts`.
   **Real-time games** additionally implement the optional `tick(state, ctx)`
   hook and set `tickIntervalMs`; the room engine then runs a server loop for
   the activity and broadcasts whenever `tick` returns true (see
   `snowfight.ts`). Turn-based activities simply omit it.
3. **Client panel** — create `apps/web/src/components/activities/MyActivityPanel.vue`
   receiving the view as a prop, composing the `Ui*` primitives, and register it
   in `components/activities/registry.ts`.
4. **Tests** — add a test file under `apps/server/test/` covering the phase
   transitions and, above all, that the view hides secret data before reveal.

Nothing in the core room logic needs to change.

## How to change the theme

Every color, spacing, radius, shadow, font size, and motion duration is a CSS
custom property in `apps/web/src/styles/tokens.css`, with semantic names
(`--color-surface`, `--color-accent`, …). Components never hard-code values, so
a restyle — including a dark theme — is a token-swap exercise. The reusable
primitives live in `apps/web/src/components/ui/`.

## Known limitations (accepted for the MVP)

- **In-memory state**: a server restart kills all rooms mid-session. Don't
  deploy or restart during a Friday meeting. (The `RoomStore` interface exists
  so Redis or a JSON snapshot can be added later.)
- Single server instance only (no Socket.IO adapter/sticky sessions).
- Late joiners spectate the current activity and participate from the next one.
- No persistence: scores and kudos vanish when the room closes.
- Deployment is intentionally deferred until the app is validated locally.
