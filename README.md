# ICHEY — Cinematic Coming Soon

Premium static brand-launch page for **ICHEY** (GitHub Pages + custom domain `ichey.in`).

## Structure (matches production repo layout)

```
├── CNAME
├── index.html
├── styles.css
├── scene.js
├── ichey-logo.png
├── google-play-badge.svg
├── apple-app-store-badge.svg
├── assets/vendor/three.module.min.js   # Three.js r170 (MIT)
└── README.md
```

Legacy copies under `assets/images/` may remain locally; published paths use the **root** filenames above (same as [ichey-demo](https://github.com/shailaja-boutique/ichey-demo)).

## Experience

- **Scene A:** Warm ivory atmosphere, timed gift-box reveal (Three.js).
- **Scenes B–C:** Scroll-driven wonder → discovery → anticipation with sticky WebGL canvas.
- **Scenes D–E:** Brand reveal, Coming Soon, non-clickable store badges, footer.

**Fallbacks:** `prefers-reduced-motion`, WebGL failure, or no JavaScript → static layout with original logo and full copy (no scroll-linked 3D).

## Third-party license

- [Three.js](https://github.com/mrdoob/three.js) **r170** — MIT — vendored at `assets/vendor/three.module.min.js` (not loaded from a CDN in production).

## Preview locally

ES modules require a local server (not `file://`):

```powershell
cd C:\Users\aruns\Downloads\ichey_demoo
python -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy

Push to `main` on `shailaja-boutique/ichey-demo`. GitHub Pages serves from root; **do not remove** `CNAME` (`ichey.in`).

### Store links (later)

In `index.html`, replace the badge `<div>` elements with `<a class="store-badge" href="...">` when verified URLs exist. Update CSS per comment in `styles.css` if needed.

## Checks performed

- HTTP 200 for `index.html`, `scene.js`, `three.module.min.js`, `ichey-logo.png`, badge SVGs.
- Three.js module import resolves (r170).
- Copy reviewed for confidentiality (no product-workflow language).
- `CNAME` unchanged (`ichey.in`).

## Known limitations

- Gift-box and floating shapes are **procedural** Three.js geometry (not pre-rendered video); quality is stylized-realistic, not film-grade CGI.
- Logo PNG is large (~1.4 MB); compress for faster first paint if desired without altering artwork.
- Lighthouse scores were not automated in this environment; test in Chrome DevTools before/after deploy.
- Instagram motion reference was not fetched; pacing follows the written storyboard.