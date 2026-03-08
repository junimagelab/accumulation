# accumulation

p5.js (WEBGL) sketch.

## Local run

Option A:
- `python3 -m http.server 8000`
- open http://localhost:8000

## Publish (GitHub Pages)

This repo is a static site (root `index.html`).

1. Push `main` to GitHub.
2. On GitHub: **Settings → Pages**
3. **Build and deployment**: *Deploy from a branch*
4. Select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Save. After a minute your site will be available at:

`https://<github-username>.github.io/accumulation/`

If assets don’t load, verify that the files exist at repo root:
- `index.html`
- `sketch.js`
- `style.css`
- `libraries/`
