# LamaSMP Store 🦙💚

A clean, green-themed custom storefront for the **LamaSMP** Minecraft server, powered by the
[Tebex Headless API](https://docs.tebex.io/developers/headless-api/overview). It renders your
packages live and **listens for changes** — add, remove, re-price or edit a package in your Tebex
panel and the store updates itself, no redeploy or refresh needed.

## Files
| File | What it does |
|------|--------------|
| `index.html` | Page structure (header, hero, store grid, about, cart drawer). |
| `styles.css` | The green design system — dark theme, glassy header, card hover glow. |
| `app.js` | Fetches packages from Tebex, renders cards, runs the **package listener**, handles the cart + checkout. |

## The package listener
`app.js` polls the Tebex Headless API every **30 seconds** (and instantly when you re-focus the tab).
It builds a fingerprint of every package (`id : price : last-updated`) and only re-renders when something
actually changes, then shows a toast:

- **No packages yet** → a friendly empty state with a live *"Listening for new packages…"* badge.
- **A package is added** → *"New packages are now available! 🎉"*
- **A package is edited / re-priced** → *"Store updated 🔄"*

Change the cadence via `CONFIG.pollInterval` in `app.js`.

## Configuration
Open `app.js` and edit the `CONFIG` block at the top:

```js
const CONFIG = {
  token: "139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21", // your Tebex public token
  storeName: "LamaSMP",           // display name (overrides Tebex)
  pollInterval: 30000,            // listener check interval (ms)
  serverIp: "play.lamasmp.net",   // ← change to your real server IP
  hostedStore: "https://lamasmp.tebex.io",
};
```

> **Note:** `serverIp` is a placeholder for the "Copy Server IP" button — set it to your real address.
> Store name, currency, platform and the package list all come straight from Tebex automatically.

## Checkout
Clicking **Checkout** creates a Tebex basket, adds your cart items, and forwards you to Tebex's secure
hosted checkout (account auth + payment). Payments, delivery and fraud protection are all handled by
Tebex — no card details ever touch this site. If the headless checkout isn't reachable (e.g. the store
is disabled in your panel), it falls back to opening your hosted Tebex store.

## Run it locally
It's a static site — any static server works:

```bash
python -m http.server 4173
# then open http://localhost:4173
```

## Deploy
Upload `index.html`, `styles.css` and `app.js` to any static host (Netlify, Vercel, Cloudflare Pages,
GitHub Pages). No build step, no backend.

---
*All payments are final and non-refundable. Not affiliated with Mojang AB or Microsoft. Payments processed by Tebex.*
