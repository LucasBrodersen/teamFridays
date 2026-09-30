# Build an MVP: "Team Fridays" — a real-time web app for informal team meetings

## Context
Our dev team holds an informal Friday meeting to get to know each other and bond.
Build a simple, real-time web app for it. This is an internal MVP: no authentication,
no database, no user accounts. Prioritise simplicity, reliability during a live
session, and a professional design that is easy to restyle later.

Goal of v1: run **one real Friday session** with the team and learn from it.
Everything that doesn't serve that first session is deferred to the v2 backlog.

## Core flow
1. **Host creates a room**: on the landing page, the host enters their name and clicks
   "Create room". The server generates a short, human-friendly room code
   (e.g. `FRI-4K7Q`, collision-checked) and a shareable link (`/room/FRI-4K7Q`).
2. **Participants join**: they open the link (or enter the code) and type only their
   name. No login. Names must be unique within a room (case-insensitive); if taken,
   ask for another.
3. **Lobby**: everyone sees the participant list live. Only the host sees the controls
   to pick and start activities.
4. **Activities**: the host starts an activity, moves it between phases (e.g. answering,
   revealing, results), and ends it. Participants interact from their own devices.
5. **Late joiners**: someone who joins mid-activity enters as a spectator of the
   current activity (they see the shared view but cannot submit/vote) and becomes a
   full participant from the next activity. No attempt to splice them into a running
   phase.
6. **End session**: the host can close the room. Rooms with no activity for 2 hours
   are cleaned up automatically.

## Session resilience (important for a live meeting)
- On join, the server issues a `sessionId` stored in `localStorage` (per room).
  Refreshing the page or a short disconnect must restore the same participant
  (and host privileges for the host) without re-entering the name.
- Show connected/disconnected state per participant. Do not remove a participant
  immediately on disconnect; allow a grace period (e.g. 2 minutes).
- If the host disconnects for longer than the grace period, allow the host role to be
  transferred to another participant (host can also transfer manually).
- **Host never blocks on stragglers**: wherever the room waits for submissions or
  votes, the host sees a live "N of M submitted" counter and a **force-advance**
  control ("Reveal with 6/8"). Non-submitters simply have no entry in that round.
- The server is the single source of truth. Clients receive state snapshots or diffs
  and never compute authoritative state themselves.
- Known limitation (accepted for MVP): state is in-memory, so a server restart or
  deploy kills all rooms mid-session. Do not deploy on Friday afternoons.

## Activities for v1
Implement these as independent modules (see architecture below), in this order:

1. **Icebreaker Question**: host draws a random question from a built-in list
   (~40 fun, work-safe questions) or types a custom one. Everyone submits an answer;
   answers are revealed together when the host clicks "Reveal".
2. **This or That**: fast binary polls (tabs vs spaces, dark vs light mode, etc.) from
   a built-in list plus custom ones. Show live results as an animated bar split.
3. **Two Truths and a Lie**: each participant submits 3 statements and marks the lie.
   The host goes through people one by one; others vote for the lie; the reveal
   shows votes and who guessed correctly. Keep a simple score.

Shared utilities available to all activities:
- **Wheel of names**: randomly picks a participant (useful for "who goes next").
- **Reactions**: lightweight emoji reactions that float briefly on screen.

## Architecture
- **Monorepo** with `apps/web` (frontend), `apps/server` (backend),
  `packages/shared` (shared TypeScript types, event names and activity contracts).
- **Frontend**: Vue 3 + TypeScript + Vite, Pinia for state, Vue Router.
- **Backend**: Node.js + TypeScript + Socket.IO. In-memory state (a `RoomStore`
  behind an interface so it can later be swapped for Redis).
- **Typed events**: define all socket events and payloads in `packages/shared`
  and use them on both sides. No untyped string events scattered in code.
- **Activity plugin contract**: each activity is a module with:
  - a server-side part: initial state, allowed actions (validated, with role checks:
    host vs participant), phase transitions, and a function that returns the
    **per-participant view** of the state (so hidden info such as the lie or
    anonymous authors never leaks to clients before the reveal);
  - a client-side part: the Vue components for host and participant views.
  - Adding a new activity must only require creating a new module and registering it,
    without touching the core room logic.
- **Validation**: validate all incoming payloads on the server (e.g. with Zod);
  enforce max lengths on names and text inputs; sanitise rendered text.
- **Single production process**: the server serves the built frontend. One process,
  one port, no reverse-proxy gymnastics.

## Design requirements (professional and easy to revamp)
- Clean, modern, professional look: think Linear / Vercel / Notion. Generous
  whitespace, clear typography hierarchy, subtle motion, no childish styling,
  despite the playful purpose.
- **Design tokens are mandatory**: all colours, spacing, radii, shadows, font sizes
  and motion durations live as CSS custom properties in a single `tokens.css`
  (with semantic names such as `--color-surface`, `--color-accent`,
  `--color-text-muted`, not `--blue-500`). No hard-coded colours or pixel values
  in components.
- **One (light) theme in v1.** Because everything routes through semantic tokens,
  a dark theme later is a token-swap exercise, not a rewrite.
- Build a small internal **UI component layer** (`Button`, `Input`, `Card`, `Avatar`,
  `Badge`, `Modal`, `Toast`, `ProgressBar`) and use it everywhere.
  Activity components must compose these primitives, never restyle raw HTML.
  A future revamp should mostly mean editing tokens and these primitives.
- Tailwind CSS is fine if its theme is mapped to the CSS tokens; otherwise use
  scoped CSS with the tokens.
- Responsive: the host usually shares their screen on a large display, and
  participants use laptops or phones. Include a **"presentation mode"** for the host
  (large type, results-focused) and a compact mobile-friendly participant view.
- Accessibility basics: keyboard navigation, visible focus states, sufficient
  contrast, `aria-live` for important real-time updates.
- Avatars: generated initials with a deterministic colour per name (no uploads).

## Deployment (required for the team test)
- The MVP must end up on a URL the team can open, not on localhost.
- Single `Dockerfile` (multi-stage: build web + server, run one Node process).
  No docker-compose — there is only one service and no database.
- Target: any single-instance container host (Railway / Fly.io / Render) or an
  internal company server. **Run exactly one instance** — Socket.IO then needs no
  sticky sessions and no Redis adapter.
- HTTPS is required (WebSockets upgrade to WSS; corporate networks and modern
  browsers will block or degrade plain ws://). The container hosts above provide
  TLS out of the box.
- Environment config via `.env` (port, CORS origin, room TTL).

## Quality and delivery
- Clear README: how to run locally, how to deploy, how to add a new activity
  (step by step), and how to change the theme.
- Unit tests focused where bugs would ruin a live session: the room store
  (join/rejoin/grace-period/host-transfer) and each activity's state transitions —
  **especially the per-participant views that must hide secret information**.
- ESLint + Prettier configured; strict TypeScript.
- Keep the scope tight: no accounts, no persistence, no video/audio, no analytics.

## v2 backlog (explicitly out of scope for the first session)
- **Guess Who** activity (anonymous answers, vote on the author).
- **Kudos Wall** activity (thank-you notes card wall).
- **Timer** utility (host-controlled countdown).
- **Dark theme** (token swap).
- Optional room-state snapshot to disk/Redis so a restart doesn't kill a session.
- Anything the team asks for after the first real Friday.

## Process
1. Start by proposing the folder structure, the shared event/type definitions and
   the activity plugin interface. Wait for my confirmation before implementing.
2. Then build the core (rooms, join, lobby, host controls, reconnection,
   force-advance) and the design system primitives.
3. Then implement the activities one at a time, starting with Icebreaker Question.
   After Icebreaker Question works end-to-end, deploy it — a URL with one working
   activity beats localhost with three.
4. At the end, list known limitations and suggested next steps.
