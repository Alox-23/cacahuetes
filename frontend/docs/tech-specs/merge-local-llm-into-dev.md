# Merge plan: `local-llm` → `dev`

Goal: `dev` becomes the branch with every feature: desktop + chat interface (feature 3), secure
account (feature 4) and Francisco's local LLM work (`local-llm`: Ollama, intranet serving, Leaflet map,
Marbella photos and launch scripts). Written 2026-11-25.

## Facts from the trial merge (`git merge-tree origin/dev local-llm`)

- Common ancestor: `2e2257e`. `dev` changed 146 files, `local-llm` changed 59, only 6 overlap.
- Clean auto-merge: all of `backend/`, `frontend/public/`, launch scripts, `frontend/src/contract/types.ts`,
  `frontend/src/i18n/es.json`, `frontend/src/pages/StopPage.module.css`, `frontend/src/data/httpData.ts`,
  `frontend/src/App.tsx`, `frontend/package.json` (adds `leaflet`, `@types/leaflet`).
- Conflicts (4 files):
  1. `frontend/src/components/ChatInput/ChatInput.tsx` – dev made it a `<textarea rows={1}>` with ref
     forwarding; local-llm added `type="text" maxLength={500}` to the old `<input>`.
  2. `frontend/src/components/RouteMap/RouteMap.tsx` – props and signature only. Dev added
     `highlighted`, `onHighlight`, `onSelect` (desktop); local-llm added `routeId` and replaced the SVG
     body with Leaflet (`L.map`, tiles from `VITE_LOCAL_TILE_URL` or `/maps/marbella.jpg` overlay,
     div-icon markers with a popup linking to `/route/:id/stop/:order`).
  3. `frontend/src/pages/RoutePage.tsx` – dev moved the page body into
     `features/route/useRouteScreen.ts` + `features/route/RouteView.tsx` (`RouteViewMobile`,
     `RouteViewDesktop`). local-llm edited the OLD page: builds `enrichedStops` (each stop filled from
     `places[stop.placeId]`: lat, lon, photo, hours, price, rating, reviewsCount, address, googleMapsUrl)
     and passes `routeId={route.id}` to `RouteMap`.
  4. `frontend/src/pages/StopPage.tsx` – dev moved the body into `features/route/StopDetail.tsx`
     (shared by mobile page and desktop panel, `layout: 'mobile' | 'desktop'`). local-llm edited the OLD
     page: real photo `<img src="/places/<placeId>.jpg">` with fallback to `/mascot/cacahuete.svg`,
     rating badge (`place.rating`, `place.reviewsCount`), partner banner (`place.partner`,
     `place.partnerPerk`), address row with `googleMapsUrl` link. Styles in `pages/StopPage.module.css`
     (`.photoImg .photoRating .star .ratingScore .ratingCount .partnerBanner .partnerBadge .partnerPerk
     .addressRow .addressText .mapsLink`).

## Branches

| Branch | Owner | Based on |
|---|---|---|
| `merge/local-llm-into-dev` | setup agent, later integration agent | `origin/dev` + `local-llm` |
| `merge/local-llm-route` | route agent | `merge/local-llm-into-dev` |
| `merge/local-llm-stop` | stop agent | `merge/local-llm-into-dev` |
| `merge/local-llm-map` | map agent | `merge/local-llm-into-dev` |

Rules for every agent: work only in your own worktree; never check out `dev`, `main` or `alex-frontend`
(they are checked out elsewhere); never push to `main`; never force-push; commit with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Verification commands, from `frontend/`:
`npm install` once, then `npm run check` (tsc + eslint), `npm test`, `npm run build`. From `backend/`:
`npm test`. Comments in code follow the repo style (short, English or Spanish as the surrounding file).

## Phase 0 — setup agent (sequential, everything else waits for it)

1. `git fetch origin`; `git checkout -b merge/local-llm-into-dev origin/dev`; `git merge origin/local-llm`.
2. Resolve the 4 conflicts the *quick* way, no feature porting:
   - ChatInput: keep dev's `<textarea>` block unchanged and add `maxLength={500}` to it. Do not add
     `type="text"` (invalid on textarea).
   - RouteMap: union of both prop sets. Final `RouteMapProps` = dev's props **plus** `routeId?: string`;
     signature destructures `{ stops, variant = 'full', height, label, className, highlighted = null,
     onHighlight, onSelect, routeId }`. Keep local-llm's Leaflet body. If `highlighted`/`onHighlight`/
     `onSelect` are then unused, reference them minimally (e.g. include in the effect deps or a
     `void` statement with a `// TODO(map agent)` comment) so eslint passes. This prop list is the
     contract the three parallel agents build on; do not change it.
   - RoutePage.tsx and StopPage.tsx: take dev's side (`origin/dev`) entirely. Local-llm's enrichment
     and photo UI are ported later by the route and stop agents.
3. Copy this plan to `frontend/docs/tech-specs/merge-local-llm-into-dev.md` and add it to the merge
   commit.
4. `npm install` in `frontend/`, then `npm run check`, `npm test`, `npm run build`; `npm test` in
   `backend/`. Fix only what the merge broke (imports, types, unused vars). Note: `httpData.ts` and
   `RouteMap.tsx` import `../../../backend/lib/marbella.json`; that already type-checked on
   `local-llm`, leave it.
5. Commit (`merge: local-llm into dev (base; feature port pending)`), push
   `origin merge/local-llm-into-dev`. Report: the final `RouteMapProps`, the exact commands that passed,
   anything you had to fix.

## Phase 1 — three parallel agents (each: fetch, `git checkout -b <branch> origin/merge/local-llm-into-dev`)

### Route agent → `merge/local-llm-route`
Files you own: `frontend/src/features/route/useRouteScreen.ts`, `frontend/src/features/route/RouteView.tsx`,
`frontend/src/features/myRoutes/useSavedRouteScreen.ts`, `frontend/src/features/myRoutes/SavedRouteView.tsx`,
`frontend/src/pages/routeHooks.ts` (only if a helper belongs there), plus a new unit test file. Do NOT touch
`RouteMap.tsx`, `StopDetail*`, `RoutePage.tsx`, `StopPage.tsx`.
1. Add a pure helper `enrichStops(stops, places)` (e.g. in `frontend/src/lib/` or next to the hook) that
   reproduces local-llm's `enrichedStops` mapping from `git show local-llm:frontend/src/pages/RoutePage.tsx`
   (fields: lat, lon, photo, hours, price, rating, reviewsCount, address, googleMapsUrl; stop value wins,
   place value fills gaps). Unit-test it with vitest.
2. Expose the enriched stops from `useRouteScreen` (and from `useSavedRouteScreen` if the saved-route
   screen renders a `RouteMap`) and pass them, plus `routeId={route.id}`, to every `<RouteMap>` in
   `RouteViewMobile`, `RouteViewDesktop` and the saved-route view. Stop lists keep using `route.stops`.
3. `npm run check && npm test && npm run build`. Commit, push `origin merge/local-llm-route`. Report
   files changed and the helper's location.

### Stop agent → `merge/local-llm-stop`
Files you own: `frontend/src/features/route/StopDetail.tsx`, `frontend/src/features/route/StopDetail.module.css`,
`frontend/src/pages/StopPage.module.css` (remove styles you moved), `frontend/src/i18n/es.json` (new keys only
if needed, e.g. alt text). Do NOT touch `RouteView*`, `useRouteScreen`, `RouteMap*`, pages.
1. Port into `StopDetail` everything local-llm added to the old `StopPage.tsx`
   (`git diff 2e2257e local-llm -- frontend/src/pages/StopPage.tsx frontend/src/pages/StopPage.module.css`):
   real photo `<img>` with the mascot fallback (`onError`, no infinite loop), rating badge, partner
   banner/perk, address row with Google Maps link. Keep `photoOverlay` working (mobile back button over
   the photo) and keep the `layout === 'desktop'` variant looking right (photo in the desktop panel: check
   `StopDetail.module.css` `.desktop` rules and `shell/DesktopMain.tsx` sizing).
2. Move the styles into `StopDetail.module.css`; delete them from `StopPage.module.css` if nothing else
   uses them.
3. `npm run check && npm test && npm run build`. Commit, push `origin merge/local-llm-stop`.

### Map agent → `merge/local-llm-map`
Files you own: `frontend/src/components/RouteMap/RouteMap.tsx`, `RouteMap.module.css`, `layout.ts`,
`frontend/vite.config.ts` / `frontend/.env.example` only if Leaflet needs it. Do NOT change `RouteMapProps`
(the setup agent fixed them) and do not touch features/ or pages/.
1. Make the Leaflet map honour dev's desktop contract, which the old SVG map implemented
   (`git show origin/dev:frontend/src/components/RouteMap/RouteMap.tsx` is the reference): `highlighted`
   marker gets a distinct style, marker hover calls `onHighlight(order)` / `onHighlight(null)`, marker click
   calls `onSelect(order)` when provided (desktop) and otherwise keeps local-llm's popup with the
   "Ver detalles y fotos" link (mobile). Update markers on prop change without recreating the map.
2. `variant="thumb"` / `height` / `label` / `className` must still work wherever dev uses them
   (`git grep -n "RouteMap" origin/dev -- frontend/src`). Check the map resizes correctly inside the
   desktop layout (`map.invalidateSize()` on container resize, ResizeObserver).
3. Stops without `lat`/`lon` must not crash the map (route agent supplies coordinates, but mock data may
   lack them): fall back to the existing `layoutStops` positions or skip gracefully.
4. `npm run check && npm test && npm run build`. Commit, push `origin merge/local-llm-map`.

## Phase 2 — integration agent (after all three report)

1. `git checkout -b merge/local-llm-integrate origin/merge/local-llm-into-dev`; merge the three branches
   in the order map, route, stop; resolve any trivial conflicts.
2. `npm run check && npm test && npm run build` in `frontend/`; `npm test` in `backend/`.
3. Push the result to `origin merge/local-llm-into-dev` (fast-forward). Report the final diff stat.

## Phase 3 — Opus review, then land

1. A second Opus agent reviews `origin/dev...origin/merge/local-llm-into-dev` against this plan: every
   local-llm behaviour present on both mobile and desktop, no `type="text"` on textarea, map contract honoured,
   tests pass. Fixes go to the same branch.
2. Land: `git push origin merge/local-llm-into-dev:dev` (must be a fast-forward; refuse otherwise).
3. Alex checks mobile and desktop in the browser: `dev` worktree `git pull --ff-only`, backend on 3000,
   frontend `npx vite --port 5180 --strictPort`, with Ollama running for the local LLM path.
