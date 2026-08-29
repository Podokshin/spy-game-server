---
name: new-minigame
description: Scaffold a new mini-game for the Игротека hub, following the exact server+client architecture used by all 9 existing games (spy, mission, codenames, mafia, wavelength, whoami, nardy, categories, crocodile). Invoke as /new-minigame <slug> <Russian title>.
disable-model-invocation: true
---

# Adding a new mini-game

This scaffolds one new game following the pattern every existing game in this repo already uses. Read at least one existing pair before writing anything — `lib/mission-game.js` + `client/src/mission/*` is the simplest complete reference; `lib/nardy-game.js` + `client/src/nardy/*` shows the "vanilla island" escape hatch for canvas/drag-and-drop-heavy screens.

Ask the user for the game's rules/screens/socket events up front if not given — this skill only covers the *architecture*, not the game design.

## 1. Server: `lib/<slug>-game.js`

A CommonJS module exporting `register<Slug>Game(io)`. Look at `lib/mission-game.js` for the shape: an `io.of('/<slug>')` namespace, an in-memory `Map` of rooms keyed by room code (reuse `lib/shared.js`'s `CODE_CHARS`/room-code generator and `sanitizeAvatar`), and socket handlers at minimum for `create_room`, `join_room`, `rejoin`, `leave_room`, `start_game`, `vote_skip`, `select_next_game`, plus whatever events the game's own rounds need. `party.js`'s cross-game "vecher igr" hooks (`partyCode` on create/join, `select_next_game` broadcasting `next_game_selected`) must be wired the same way every other game does it — check `lib/party.js` for the shared helpers.

Register it in `server.js` next to the other eight `register*Game(io)` calls.

## 2. Client entry: `client/<slug>/index.html`

Copy this verbatim, swapping `<slug>` and the `<title>`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><Russian Title> Online</title>
    <meta name="theme-color" content="#0a0a10">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/<slug>/style.css">
    <link rel="stylesheet" href="/shorts.css">
    <link rel="stylesheet" href="/radio.css">
  </head>
  <body>
    <div id="root"></div>
    <script src="/socket.io/socket.io.js"></script>
    <script src="/confetti.js"></script>
    <script src="/party.js"></script>
    <script type="module" src="/src/<slug>/main.jsx"></script>
    <script src="/shorts.js" defer></script>
    <script src="/radio.js" defer></script>
  </body>
</html>
```

If the game needs its own visual design (no existing vanilla page to reuse), write `public/<slug>/style.css` from scratch following the token conventions in `public/spy/style.css`'s `:root` block — **copy the full `:root` block including `--sp-1` through `--sp-10`**, don't hand-roll a subset. (A previous game's stylesheet shipped for a long time with `--sp-4` used but never defined, silently zeroing out all `.field` padding — diff your new file's `:root` against a known-good one like `public/mission/style.css` before considering this done.)

## 3. `client/src/<slug>/main.jsx`

Trivial, identical in every game:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

## 4. `client/src/<slug>/use<Slug>Game.js`

The hook. Copy `client/src/mission/useMissionGame.js` as the base and adapt the game-specific state/events. Non-negotiable parts to keep exactly as-is:

- `const socket = io('/<slug>')` at **module scope**, not inside the hook — created once per page load, not per-render (avoids StrictMode double-connect).
- `AVATARS` constant matching `lib/shared.js`'s `ALLOWED_AVATARS` exactly.
- `SESSION_KEY` + `loadSession`/`saveSession`/`clearSession` via `sessionStorage`, used for the `rejoin` flow.
- A `liveRef` ref mirroring the latest state (`liveRef.current = {...}` reassigned unconditionally every render), used inside the socket listeners registered in the single mount-time `useEffect(..., [])` so they never see stale closures.
- **`applyRoomUpdate(room)` must resolve the acting player as `room.playerId || liveRef.current.myPlayerId`, never the ref alone.** This exact bug (host briefly rendering as non-host right after `create_room`, because React hadn't flushed `setMyPlayerId` yet) shipped once in Mafia — see `client/src/mafia/useMafiaGame.js` for the fixed version if you want the reference.
- The `rejoin` ack handler must reconstruct every phase the server can report (lobby is handled by `applyRoomUpdate`; every round-phase, end, and skipped need an explicit branch) — a missing branch strands a reconnecting player on the wrong screen.
- The party-integration `useEffect` that auto-joins via `partyParams` on mount, and `selectNextGame`/`onNextGameSelected` wiring to `window.PartyHub`.

If any server event fires asynchronously shortly *after* another event that triggers a screen transition (e.g. a follow-up reveal sent only to one player right after a broadcast that changes everyone's screen), register that event's listener in this hook's mount-time effect — not only in the new screen's own `useEffect` — and pass the already-known value down as a prop. A screen-local listener registered after the screen mounts can miss an event that arrives in the same tick as the transition; this exact race shipped once in Crocodile (the artist's chosen word not appearing in the drawing badge).

## 5. `client/src/<slug>/App.jsx`

Copy `client/src/mission/App.jsx` as the structural base. Required elements, non-negotiable:

- A local `AvatarIcon` component rendering `<img src="/avatars/${key}.webp">` — do not import `window.avatarIcon` or load `/avatar-icons.js` (that's only for the still-vanilla games).
- A `PartySection` component that `useEffect`-calls `window.PartyHub.renderPartySection(ref.current, {...})` into a plain `<div ref={ref}>`.
- **The root element must have `id="app"`, and it must be the element whose box represents the actual content column** — not an outer wrapper that also contains fixed-position decorative elements (that would make the box span the full viewport, breaking `shorts.js`'s gap math). If the page has no decorative fixed-position siblings, `id="app"` on the single top-level `<div>` is correct and matches every existing game.
- The credit badge must have `className="credit"` (plain vanilla games) or `className="credit ...tailwind classes"` (if the page is Tailwind-based like the hub) — `public/shorts.js` does `document.querySelector('.credit')` and silently no-ops without it. This exact gap shipped once on the hub.
- Phosphor icons (`@phosphor-icons/react`, `weight="bold"`) replace UI-chrome glyphs (back arrow, headings, copy-link, skip-vote, undo/clear/tool buttons) — but leave *content* emoji alone (avatars historically, medals, the credit sparkle, in-game status emoji like ✅/⏰/🎉). Don't relitigate this distinction per-game; it's an established, deliberate convention.
- One function component per screen, each mirroring what the equivalent vanilla screen would look like 1:1 in markup/CSS classes if this game has prior art, or following `public/mission/style.css`'s class conventions (`.screen.active`, `.field`, `.chip-list`, `.player-chip`, `.primary-btn`/`.secondary-btn`) if it doesn't.

If a screen is inherently imperative and fragile (raw canvas drawing, drag-and-drop with manual hit-testing, anything you'd genuinely rather not re-derive as React-driven rendering), don't force it into React state. Extract it into a factory module (see `client/src/nardy/boardIsland.js` or `client/src/crocodile/drawingIsland.js`) taking `(container, opts)` and returning `{ destroy() }`, mounted from a thin wrapper component's `useEffect`. This is a deliberate, disclosed tradeoff in this codebase, not a fallback to apologize for.

## 6. Register the Vite entry

Add to `client/vite.config.js`'s `build.rollupOptions.input`:

```js
<slug>: path.resolve(import.meta.dirname, '<slug>/index.html'),
```

If the game reuses an existing `public/<slug>/style.css` (i.e. it already existed as a vanilla page before this migration), add its path to the dev-proxy regex a few lines below (`^/(spy|mission|...|<slug>)/style\\.css$`) so `npm run dev` can reach it.

## 7. Build and verify

```bash
cd client && npm run build
```

Then start the root server (`node server.js` from repo root) and test through the Browser tool with real multi-tab Socket.io traffic — create a room, join with 2+ more tabs, play a full round including the skip-vote and end-screen party integration — not just a static render check. This repo has shipped real bugs (races, missing DOM hooks) that only a full playthrough catches.
