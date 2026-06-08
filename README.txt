LamaSMP Store — file overview
=============================

Files
-----
index.html   The page structure. Links to styles.css and script.js, and uses logo.png.
styles.css   All styling (colors, layout, the green theme, cards, modals, etc.).
script.js    All behavior: loads your Tebex products, the cart, username prompt,
             add-to-cart popup, checkout, and the IP-copy button.
logo.png     Your server logo (shown top-left and used as the browser tab icon).

Keep all four files in the SAME folder.

Hosting
-------
Upload the whole folder to your web host so the files sit next to each other, e.g.:
  yoursite.com/index.html
  yoursite.com/styles.css
  yoursite.com/script.js
  yoursite.com/logo.png

The live Tebex products and checkout only work when the site is served from a real
domain (Tebex blocks cross-origin requests). Opening index.html directly from your
computer will show demo Ranks/Tools instead — that's expected.

Common edits
------------
- Tebex public key:  top of script.js  ->  const TEBEX_KEY = "...";
- Server IP shown in the top-left pill:  in index.html, the <button class="ip-pill"> text.
- Discord/Support link:  search index.html for "discord.com/invite" and replace.
- Colors / theme:  top of styles.css, the :root { --green, --bg, ... } variables.
- Replace the logo:  swap logo.png with your own image (same filename), or change the
  src in index.html.
