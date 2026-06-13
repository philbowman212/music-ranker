# Music Ranker

A pairwise music ranking PWA. Users pick an artist, import their full
discography from the MusicBrainz API, then rank songs through head-to-head
comparisons driven by an interactive merge sort, producing a complete ordered
ranking of the artist's catalog.

## How it works (product overview)

1. **Pick an artist** — search MusicBrainz for an artist.
2. **Import discography** — fetch the artist's releases and recordings from
   the MusicBrainz API and dedupe into a canonical song list.
3. **Rank via matchups** — the app presents two songs at a time; the user
   picks the one they prefer. Comparisons are ordered by an interactive merge
   sort, so the number of matchups is close to the theoretical minimum
   (O(n log n)) rather than every possible pair.
4. **Results** — a complete ordered ranking, with save/resume so long
   rankings can be done across sessions.

## Stack

| Concern    | Choice                          | Why |
| ---------- | ------------------------------- | --- |
| Build      | Vite                            | Fast dev server, simple static output for GitHub Pages |
| UI         | React 18 + TypeScript (strict)  | Familiar, typed component model |
| Styling    | Plain CSS (`src/index.css`)     | No CSS framework until the UI warrants one |
| Data       | MusicBrainz API (no key needed) | Open, comprehensive discography data |
| Persistence| localStorage (planned)          | Save/resume without a backend |
| Hosting    | GitHub Pages via Actions        | Free static hosting; deploys on push to `main` |

Dependencies are intentionally minimal: `react` and `react-dom` at runtime,
nothing else. Prefer hand-rolled solutions over new dependencies unless
there's a clear win.

## Project layout

```
.github/workflows/deploy.yml   # Build + deploy to GitHub Pages on push to main
public/manifest.webmanifest    # PWA manifest
public/icons/                  # App icons (placeholders for now)
src/main.tsx                   # Entry point
src/App.tsx                    # Root component (landing page for now)
src/index.css                  # Global styles
vite.config.ts                 # Note: base is '/music-ranker/' for Pages
```

## Conventions

- TypeScript strict mode; no `any` unless unavoidable and commented.
- Functional React components only; hooks for state.
- Keep modules small and feature-scoped (e.g. `src/ranking/`, `src/musicbrainz/`)
  as features land; pure logic (sorting, deduping) lives apart from components
  so it can be unit-tested without the DOM.
- MusicBrainz etiquette: rate-limit to 1 request/second and send a descriptive
  `User-Agent` per their API guidelines.
- `npm run build` runs `tsc -b` first — type errors fail the build and the
  deploy. Run it before pushing.
- Asset URLs must respect Vite's `base` (`import.meta.env.BASE_URL`); never
  hardcode absolute `/...` paths in app code.

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
app and deploys `dist/` to GitHub Pages. The site is served at
`https://<user>.github.io/music-ranker/`, which is why `vite.config.ts` sets
`base: '/music-ranker/'`. The repo's Pages settings must have
"Source: GitHub Actions" selected (one-time manual step).

## PWA status

Currently: manifest + placeholder icons, so the app is installable. Not yet:
service worker / offline support — add (e.g. via `vite-plugin-pwa`) once there
is real functionality worth caching. The PNG icons are solid-color
placeholders; replace them with real artwork (and update `icon.svg`) before
any public release.

## Feature roadmap

Build in this order — each stage is independently shippable:

1. **Ranking engine** — pure-TypeScript interactive merge sort: a state
   machine that emits "compare A vs B" requests, accepts answers, and is
   serializable at every step (this is what makes save/resume possible).
   Unit-test it thoroughly before any UI.
2. **MusicBrainz import** — artist search, discography fetch (release groups →
   recordings), dedupe of live versions/remasters/duplicate recordings into a
   clean song list. Respect rate limits.
3. **Matchup UI** — the head-to-head comparison screen wired to the ranking
   engine, with progress indication (estimated comparisons remaining).
4. **Results + save/resume** — final ranking view, persistence of in-progress
   and completed rankings to localStorage, shareable/exportable results.
