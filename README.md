# Rubik's Cube Solver

A kid-friendly Rubik's Cube solver that runs entirely in the browser.
Hold each face up to the camera, the app auto-detects the colors and
walks you through the solve with voice narration and an animated 3D
preview.

**Live demo:** https://alok-kumbhare.github.io/cubesolver/

## Features
- 📷 **Camera scanner** — auto-detects the cube; just hold each face up
- 🎨 Tap any sticker to fix mis-detected colors before solving
- 🧊 Live 3D cube preview with animated face rotations (Three.js)
- 🔊 Voice narration of each step (browser `speechSynthesis`)
- 📱 Mobile-first responsive layout
- 🧮 Kociemba two-phase solver via [`cubejs`](https://github.com/ldez/cubejs)
- 🚀 Fully client-side — no backend, no tracking

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
cd web
npm run build
npm run preview
```

The `web/dist/` folder is a static site you can host anywhere
(GitHub Pages, Netlify, Cloudflare Pages, S3, …).

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the web app to
GitHub Pages on every push to `main`. One-time setup:

1. Push the repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — the site will be live at
   `https://<your-username>.github.io/<repo-name>/`.

The workflow passes the repo name to Vite via `VITE_BASE` so asset URLs
resolve correctly under the `/repo-name/` subpath.

> **Camera note:** GitHub Pages serves over HTTPS, which is required
> for `getUserMedia()`. The scanner won't work over plain `http://`
> (except on `localhost`).

## Tests

```bash
cd web
npx vitest run --config vitest.config.ts
```

## Layout

```
web/
  src/
    cube/         model, solver wrapper, move parser, theme
    components/   ColorPalette, CubeNet, Cube3D, StepViewer, CameraScanner, IsoCubeIcon
    hooks/        useTTS
    styles/       theme.css (Catppuccin Mocha)
    types/        cubejs.d.ts (3rd-party type shim)
    App.tsx       orchestrator
    main.tsx      entry
  tests/          parity tests
.github/workflows/deploy.yml   GitHub Pages deploy
```

## License

MIT — see [LICENSE](LICENSE).
