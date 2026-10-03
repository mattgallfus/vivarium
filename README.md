# Vivarium

A playable browser ecosystem: autonomous foraging, energy tradeoffs, reproduction, inherited traits, mutation, and population analytics.

## Play

Play online: https://mattgallfus.github.io/vivarium/

Click creatures to inspect them. Drag to pan, scroll to zoom, and use 1×–20× speed to watch generations change. Environment sliders change food supply, mutation, energy costs, and clustering. Save locally or export/import a JSON world.

## Run locally

Run `python -m http.server 4173` and open `http://localhost:4173`.

The site is entirely static and has no external dependencies. `src/simulation.mjs` runs independently of the renderer. GitHub Pages publishes the root of the `main` branch; `.nojekyll` keeps the files as plain static assets.
