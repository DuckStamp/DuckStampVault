# Duck Stamp Vault (PWA)

Static, offline-capable web app for tracking a collection of U.S. Federal Duck Stamps.

## Quick deploy (GitHub Pages)
1. Create a public repo and upload **all files in this folder** to the repo root.
2. In **Settings → Pages**, set:
   - Source: *Deploy from a branch*
   - Branch: `main`
   - Folder: `/ (root)`
3. Visit your site at `https://<username>.github.io/duck-stamp-vault/`

## Features
- Installable PWA (Add to Home Screen)
- Offline-ready (`sw.js`)
- Auto-fill Scott #, artist, species, and face value from `catalog.json`
- Local-only storage (IndexedDB); export/import JSON

**Catalog:** Includes face values for 1934–2025. Artist/species coming next build.