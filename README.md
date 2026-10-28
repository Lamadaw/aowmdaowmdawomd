# LamaSMP Store — GitHub Pages

This version uses the latest LamaSMP storefront with LAMA+ and LAMA++ rank cards, a moving green border shine on LAMA++, and improved text readability.

## Deploy

1. Upload `index.html` and `CNAME` to the **root** of your GitHub Pages repository (not inside a folder).
2. Commit the files to your publishing branch (usually `main`).
3. Under **Settings → Pages**, set the source to the root of that branch.
4. Confirm the custom domain is `store.lamasmp.net`.
5. Keep the Cloudflare DNS CNAME `store` → `lamadaw.github.io` configured as DNS only.

The website's CSS, JavaScript, and logo are included inside `index.html`. You do not need separate `styles.css`, `script.js`, or `logo.png` files for this build. The storefront retrieves live package data from Tebex, so package prices and availability depend on your Tebex configuration.
