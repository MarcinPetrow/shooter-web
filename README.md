# Shooter Web

Shooter Web is a browser-based 2D arena shooter prototype focused on fast movement, destructible terrain, grappling mobility, bots, and pickup-driven combat. It is built as a static web app and can run locally or be published to GitHub Pages.

## Highlights

- Fullscreen browser gameplay with HUD integrated into the game view
- Destructible terrain with weapon and explosion damage
- Procedurally generated arenas with larger platforms and environmental props
- Multiple weapons with distinct recoil and firing behavior
- Grapple movement, grenades, respawn flow, and bot combat
- Pickups such as medkits and grenade refills
- Static deployment pipeline for GitHub Pages

## Tech Stack

- Vanilla JavaScript
- HTML5 Canvas
- CSS
- Node.js for local static hosting and Pages sync scripts

## Project Structure

```text
.
├── public/     # Source files for local development
├── docs/       # Published static build for GitHub Pages
├── server.js   # Local development server
└── package.json
```

## Local Development

Requirements:

- Node.js 18 or newer

Install dependencies if needed and start the local server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Controls

- `A` / `D` move
- `W` jump
- `Shift` sprint
- `LMB` fire
- `RMB` grapple
- `G` throw grenade
- `1` `2` `3` `4` switch weapons
- `R` respawn

## Deployment

This repository is configured for GitHub Pages publishing.

Source of truth:

- `public/` is the development version
- `docs/` is the static directory published by GitHub Pages

Sync the Pages build before pushing:

```bash
npm run sync-pages
```

The repository also includes a GitHub Actions workflow that publishes updates automatically after changes are pushed.

## Notes

- This is currently a prototype focused on gameplay iteration rather than production hardening.
- If you change files in `public/`, make sure `docs/` is refreshed before deployment.
