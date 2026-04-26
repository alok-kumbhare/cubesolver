# Rubik's Cube Solver — Web

Browser version of the solver. Fully client-side (no backend).

## Features
- Interactive 2D cube net painter
- Live 3D cube preview with **animated face rotations** (Three.js)
- **Camera scanner** — point your webcam at each face, auto-detect colors
- **Voice narration** of each step (browser `speechSynthesis`)
- Kid-friendly UI with voice narration
- Kociemba two-phase solver via [`cubejs`](https://github.com/ldez/cubejs)

## Stack
- Vite + React + TypeScript
- `cubejs` — Kociemba solver
- `three` + `@react-three/fiber` + `@react-three/drei` — 3D rendering
- Native `getUserMedia` (camera) + `speechSynthesis` (TTS)

## Develop

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173/

## Build

```bash
npm run build
npm run preview
```

The `dist/` folder is a static site you can host anywhere
(GitHub Pages, Netlify, Cloudflare Pages, S3, …).

## Deploy to GitHub Pages

This repo includes a workflow at `.github/workflows/deploy.yml` that
builds and publishes the web app to GitHub Pages on every push to
`main`. One-time setup:

1. **Push the repo to GitHub** (any name is fine).
2. In the repo on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or trigger the workflow manually from the **Actions**
   tab → "Deploy web app to GitHub Pages" → **Run workflow**).
5. After the run finishes, the site is live at
   `https://<your-username>.github.io/<repo-name>/`.

The workflow passes the repo name to Vite via the `VITE_BASE`
environment variable so asset URLs resolve correctly under the
`/repo-name/` subpath. If you ever rename the repo, the next deploy
picks up the new path automatically.

> **Camera note:** GitHub Pages serves over HTTPS, which is required
> for `getUserMedia()`. The scanner won't work over plain `http://`.

## Tests

```bash
npx tsx tests/parity.test.mts
```

Verifies the solver round-trips a set of scrambles back to the solved state.

## Notes
- The Kociemba solver does a one-time ~5s precalculation on first solve.
  We pre-warm it on app load, so by the time the user paints the cube
  it's usually ready.
- Camera color detection uses simple HSV thresholds — works best in even
  lighting. Manual paint is always available as a fallback / correction.
- The browser `SpeechSynthesis` API is available in Chrome, Edge, Safari,
  and Firefox; quality varies by OS.

## Layout

```
src/
  cube/         model, solver wrapper, move parser, theme
  components/   ColorPalette, CubeNet, Cube3D, StepViewer, CameraScanner
  hooks/        useTTS
  styles/       theme.css (Catppuccin Mocha)
  types/        cubejs.d.ts (3rd-party type shim)
  App.tsx       orchestrator
  main.tsx      entry
tests/
  parity.test.mts
```
