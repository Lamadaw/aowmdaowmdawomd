/* ===================================================================
   LamaSmp Store — Tebex Headless storefront
   -------------------------------------------------------------------
   Live package "listener": polls the Tebex Headless API and re-renders
   the store whenever packages are added, removed, priced or edited.
   =================================================================== */

const CONFIG = {
  // Your Tebex public token (the "public key").
  token: "139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21",

  // Display name for the store (overrides the name from Tebex).
  storeName: "LamaSMP",

  // How often to check Tebex for package changes (ms).
  pollInterval: 30000,

  // Shown on the "Copy Server IP" button — edit to your real address.
  serverIp: "lamasmp.net",

  // Fallback hosted store (auto-filled from the API if available).
  hostedStore: "https://lamasmp.tebex.io",
};

const API = `https://headless.tebex.io/api/accounts/${CONFIG.token}`;

/* ---------------------------- state ---------------------------- */
const state = {
  store: null,
  categories: [],
  packages: [],          // flat list
  cart: loadCart(),      // [{ id, qty }]
  view: "overview",      // "overview" | "category"
  openCategoryId: null,  // which category is drilled into
  username: localStorage.getItem("lamasmp_user") || "",
  signature: null,       // fingerprint of the last rendered package set
  currency: "EUR",
};

// Vibrant banner gradients, cycled per category (green-led, on-brand).
const CATEGORY_GRADIENTS = [
  "linear-gradient(120deg, #15803d, #22c55e)", // green
  "linear-gradient(120deg, #1d4ed8, #38bdf8)", // blue
  "linear-gradient(120deg, #7c3aed, #c026d3)", // purple
  "linear-gradient(120deg, #0d9488, #2dd4bf)", // teal
  "linear-gradient(120deg, #b45309, #f59e0b)", // amber
  "linear-gradient(120deg, #be185d, #fb7185)", // rose
];

/* ---------------------------- helpers --------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function money(amount, currency = state.currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Tebex descriptions are HTML; allow basic formatting tags only.
function safeHtml(html = "") {
  const allowed = /^(\/?(p|br|ul|ol|li|strong|b|em|i|h1|h2|h3|h4|span|div))$/i;
  return html.replace(/<\s*\/?\s*([a-z0-9]+)(\s[^>]*)?>/gi, (tag, name) =>
    allowed.test(name) ? tag.replace(/\son\w+="[^"]*"/gi, "").replace(/style="[^"]*"/gi, "") : ""
  );
}

function plural(n, unit) { return `${n} ${unit}${n === 1 ? "" : "s"}`; }

function billingLabel(pkg) {
  if (pkg.type !== "subscription") return "one-time";
  const p = pkg.expiry_period;
  if (!p || !p.count) return "subscription";
  return p.count === 1 ? `/ ${p.unit}` : `/ ${plural(p.count, p.unit)}`;
}

/* --------------------------- data layer ------------------------- */
async function fetchJson(url, options) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, ...options });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadStoreInfo() {
  try {
    const { data } = await fetchJson(API);
    state.store = data;
    state.currency = data.currency || "EUR";
    if (data.webstore_url) CONFIG.hostedStore = data.webstore_url;
    applyStoreInfo(data);
  } catch (err) {
    console.warn("Could not load store info:", err);
  }
}

async function loadPackages() {
  const { data } = await fetchJson(`${API}/categories?includePackages=1`);
  const categories = (data || []).sort((a, b) => a.order - b.order);
  const packages = [];
  for (const cat of categories) {
    for (const pkg of cat.packages || []) {
      packages.push({ ...pkg, _category: cat.name });
    }
  }
  state.categories = categories.filter((c) => (c.packages || []).length);
  state.packages = packages;
  return packages;
}

// A fingerprint of what's on sale, so we only re-render on real changes.
function fingerprint(packages) {
  return packages
    .map((p) => `${p.id}:${p.total_price}:${p.updated_at}`)
    .sort()
    .join("|");
}

/* ----------------------------- render --------------------------- */
function applyStoreInfo(store) {
  const name = CONFIG.storeName || store.name || "LamaSMP";
  $("#brandName").textContent = name;
  $("#heroName").textContent = name;
  $("#footerName").textContent = name;
  $$(".copy-name").forEach((el) => (el.textContent = name));
  document.title = `${name} Store`;
}

/* ---- shopping-as (who you're buying for) ---- */
function renderShoppingAs() {
  const el = $("#shoppingAs");
  if (state.username) {
    el.innerHTML = `
      <span class="shopping-as__label">Shopping as <b>${escapeHtml(state.username)}</b></span>
      <button class="shopping-as__change" id="changeUser">Change</button>`;
    $("#changeUser").addEventListener("click", () => { state.username = ""; renderShoppingAs(); setTimeout(() => $("#userInput")?.focus(), 40); });
  } else {
    el.innerHTML = `
      <span class="shopping-as__label">Enter your username to start shopping</span>
      <form class="shopping-as__form" id="userForm">
        <input class="shopping-as__input" id="userInput" placeholder="Your Minecraft username" maxlength="16" autocomplete="off" spellcheck="false" />
        <button class="shopping-as__set" type="submit">Continue</button>
      </form>`;
    $("#userForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#userInput").value.trim();
      if (!name) return;
      state.username = name;
      localStorage.setItem("lamasmp_user", name);
      renderShoppingAs();
      toast(`Shopping as ${name}`, "👤");
    });
  }
}

/* ---- category overview + drill-in ---- */
function categoryImage(cat) {
  if (cat.image_url) return cat.image_url;
  const withImg = (cat.packages || []).find((p) => p.image);
  return withImg?.image || "logo.png";
}

function renderStore() {
  if (!state.packages.length) {
    $("#catGrid").hidden = false;
    $("#catView").hidden = true;
    $("#catGrid").innerHTML = emptyState();
    return;
  }
  if (state.view === "category" && state.categories.some((c) => c.id === state.openCategoryId)) {
    renderCategoryView(state.openCategoryId);
  } else {
    renderOverview();
  }
}

function renderOverview() {
  state.view = "overview";
  $("#catView").hidden = true;
  const grid = $("#catGrid");
  grid.hidden = false;
  grid.innerHTML = state.categories
    .map((cat, i) => {
      const grad = CATEGORY_GRADIENTS[i % CATEGORY_GRADIENTS.length];
      const slug = (cat.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `
        <button class="cat-card cat-card--${slug}" data-cat="${cat.id}" style="background:${grad}">
          <div class="cat-card__text">
            <h3 class="cat-card__name">${escapeHtml(cat.name)}</h3>
            <span class="cat-card__cta">Click to view →</span>
          </div>
          <img class="cat-card__img" src="${categoryImage(cat)}" alt="" loading="lazy" />
        </button>`;
    })
    .join("");
  $$(".cat-card", grid).forEach((c) =>
    c.addEventListener("click", () => openCategory(Number(c.dataset.cat)))
  );
}

function openCategory(id) {
  state.view = "category";
  state.openCategoryId = id;
  renderCategoryView(id);
  $("#store").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCategoryView(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) { renderOverview(); return; }
  $("#catGrid").hidden = true;
  $("#catView").hidden = false;
  $("#catTitle").textContent = cat.name;
  const grid = $("#grid");
  grid.innerHTML = (cat.packages || []).map(packageCard).join("");
  $$("[data-add]", grid).forEach((btn) =>
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.add)))
  );
}

function packageCard(pkg) {
  const img = pkg.image
    ? `<img src="${pkg.image}" alt="${escapeHtml(pkg.name)}" loading="lazy" />`
    : `<div class="card__media-fallback">${escapeHtml((pkg.name || "?")[0])}</div>`;
  const badge = pkg.type === "subscription" ? "Subscription" : "One-time";
  return `
    <article class="card" data-id="${pkg.id}">
      <div class="card__media">
        ${img}
        <span class="card__badge">${badge}</span>
      </div>
      <div class="card__body">
        <h3 class="card__name">${escapeHtml(pkg.name)}</h3>
        <div class="card__desc">${safeHtml(pkg.description || "")}</div>
        <div class="card__foot">
          <div class="card__price">
            <b>${money(pkg.total_price ?? pkg.base_price)}</b>
            <span>${billingLabel(pkg)}</span>
          </div>
          <button class="card__add" data-add="${pkg.id}">Add to cart</button>
        </div>
      </div>
    </article>`;
}

function emptyState() {
  return `
    <div class="empty">
      <img class="empty__icon" src="logo.png" alt="" width="64" />

      <h3>No packages yet</h3>
      <p>The store is being set up. New packages will appear here automatically — no refresh needed.</p>
      <span class="empty__listening"><span class="live__dot"></span> Listening for new packages…</span>
    </div>`;
}

/* ------------------------------ cart ---------------------------- */
function loadCart() {
  try { return JSON.parse(localStorage.getItem("lamasmp_cart")) || []; }
  catch { return []; }
}
function saveCart() { localStorage.setItem("lamasmp_cart", JSON.stringify(state.cart)); }

function findPackage(id) { return state.packages.find((p) => p.id === id); }

function addToCart(id) {
  const pkg = findPackage(id);
  if (!pkg) return;
  const line = state.cart.find((i) => i.id === id);
  if (line) {
    if (!pkg.disable_quantity) line.qty += 1;
  } else {
    state.cart.push({ id, qty: 1 });
  }
  saveCart();
  renderCart();
  bumpCartCount();
  toast(`Added “${pkg.name}” to cart`, "🛒");
  openCart();
}

function changeQty(id, delta) {
  const line = state.cart.find((i) => i.id === id);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((i) => i.id !== id);
  saveCart();
  renderCart();
}

function cartCount() { return state.cart.reduce((n, i) => n + i.qty, 0); }
function cartTotal() {
  return state.cart.reduce((sum, i) => {
    const pkg = findPackage(i.id);
    return sum + (pkg ? (pkg.total_price ?? pkg.base_price) * i.qty : 0);
  }, 0);
}

function bumpCartCount() {
  const el = $("#cartCount");
  const n = cartCount();
  el.textContent = n;
  el.classList.toggle("show", n > 0);
}

function renderCart() {
  const wrap = $("#cartItems");
  bumpCartCount();

  // Drop cart lines whose package no longer exists.
  state.cart = state.cart.filter((i) => findPackage(i.id));

  if (!state.cart.length) {
    wrap.innerHTML = `<div class="cart-empty"><span>🛒</span>Your cart is empty.<br />Add a package to get started!</div>`;
    $("#checkoutBtn").disabled = true;
    $("#cartTotal").textContent = money(0);
    return;
  }

  wrap.innerHTML = state.cart.map((line) => {
    const pkg = findPackage(line.id);
    const thumb = pkg.image
      ? `<img class="cart-item__img" src="${pkg.image}" alt="" />`
      : `<div class="cart-item__img cart-item__img--ph">${escapeHtml((pkg.name || "?")[0])}</div>`;
    const qtyControls = pkg.disable_quantity
      ? `<span class="cart-item__qty-fixed"></span>`
      : `<div class="qty">
           <button data-dec="${pkg.id}" aria-label="Decrease">−</button>
           <span>${line.qty}</span>
           <button data-inc="${pkg.id}" aria-label="Increase">+</button>
         </div>`;
    return `
      <div class="cart-item">
        ${thumb}
        <div class="cart-item__main">
          <p class="cart-item__name">${escapeHtml(pkg.name)}</p>
          <span class="cart-item__price">${money((pkg.total_price ?? pkg.base_price) * line.qty)}</span>
          <div class="cart-item__bottom">
            ${qtyControls}
            <button class="cart-item__remove" data-rm="${pkg.id}">Remove</button>
          </div>
        </div>
      </div>`;
  }).join("");

  $$("[data-inc]", wrap).forEach((b) => b.addEventListener("click", () => changeQty(Number(b.dataset.inc), 1)));
  $$("[data-dec]", wrap).forEach((b) => b.addEventListener("click", () => changeQty(Number(b.dataset.dec), -1)));
  $$("[data-rm]", wrap).forEach((b) => b.addEventListener("click", () => removeFromCart(Number(b.dataset.rm))));

  $("#cartTotal").textContent = money(cartTotal());
  $("#checkoutBtn").disabled = false;
}

function openCart() {
  $("#drawer").classList.add("show");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#overlay").hidden = false;
  requestAnimationFrame(() => $("#overlay").classList.add("show"));
}
function closeCart() {
  $("#drawer").classList.remove("show");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#overlay").classList.remove("show");
  setTimeout(() => ($("#overlay").hidden = true), 250);
}

/* ---------------------------- checkout -------------------------- */
// Basket package operations live at the API root (NOT under /accounts/{token}).
const HEADLESS_ROOT = "https://headless.tebex.io/api";
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };
const RESUME_PARAM = "tebex_resume";
const PENDING_KEY = "lamasmp_pending";

// The Tebex-hosted checkout page for a basket (302s to pay.tebex.io).
const checkoutUrl = (ident) => `https://checkout.tebex.io/checkout/${ident}`;
const returnBase = () => location.origin + location.pathname;

async function checkout() {
  if (!state.cart.length) return;
  const btn = $("#checkoutBtn");
  btn.disabled = true;
  btn.textContent = "Starting checkout…";
  const reset = () => { btn.disabled = false; btn.textContent = "Checkout"; };

  try {
    const ret = returnBase();
    // 1. Create a basket, returning to this store after payment.
    const { data: basket } = await fetchJson(`${API}/baskets`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ complete_url: ret, cancel_url: ret, complete_auto_redirect: true }),
    });

    // 2. Minecraft baskets must be authenticated (player login) BEFORE
    //    packages can be added. Send the player to Tebex login first.
    const auth = await fetchJson(
      `${API}/baskets/${basket.ident}/auth?returnUrl=${encodeURIComponent(`${ret}?${RESUME_PARAM}=${basket.ident}`)}`
    );
    const authUrl = firstAuthUrl(auth);
    if (authUrl) {
      // Remember the cart so we can finish the basket when they return.
      localStorage.setItem(PENDING_KEY, JSON.stringify({ ident: basket.ident, cart: state.cart }));
      window.location.href = authUrl;            // → Tebex login → back here
      return;
    }

    // 3. Already authenticated / no login needed: add packages, go to checkout.
    await addPackages(basket.ident, state.cart);
    window.location.href = checkoutUrl(basket.ident);   // → Tebex checkout, never the store
  } catch (err) {
    console.warn("Checkout error:", err);
    toast("Checkout needs the store to be enabled in Tebex.", "⚠️");
    reset();
  }
}

async function addPackages(ident, cart) {
  for (const line of cart) {
    await fetchJson(`${HEADLESS_ROOT}/baskets/${ident}/packages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ package_id: line.id, quantity: line.qty }),
    });
  }
}

// Runs on page load: if the player just came back from Tebex login,
// add their packages to the (now authenticated) basket and send them to checkout.
async function resumeCheckout() {
  const ident = new URLSearchParams(location.search).get(RESUME_PARAM);
  if (!ident) return false;

  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch {}
  localStorage.removeItem(PENDING_KEY);
  history.replaceState({}, "", returnBase());   // tidy the URL

  try {
    toast("Finishing checkout…", "🔒");
    if (pending && pending.ident === ident && pending.cart?.length) {
      await addPackages(ident, pending.cart);
    }
  } catch (err) {
    console.warn("Could not finish basket on return:", err);
  }
  window.location.href = checkoutUrl(ident);     // → Tebex checkout
  return true;
}

function firstAuthUrl(auth) {
  const flat = Array.isArray(auth) ? auth.flat(Infinity) : [auth];
  const entry = flat.find((x) => x && x.url);
  return entry?.url || null;
}

/* ------------------------- live listener ------------------------ */
async function refresh({ silent = false } = {}) {
  try {
    const packages = await loadPackages();
    const sig = fingerprint(packages);
    if (sig === state.signature) return;          // nothing changed
    const firstLoad = state.signature === null;
    const prevCount = state.packages.length && state.signature ? countFromSig(state.signature) : 0;

    state.signature = sig;
    renderStore();
    renderCart();

    if (!firstLoad && !silent) {
      const now = packages.length;
      if (now > prevCount) toast("New packages are now available! 🎉", "✨");
      else toast("Store updated", "🔄");
    }
    setLive(true);
  } catch (err) {
    console.warn("Refresh failed:", err);
    setLive(false);
  }
}

function countFromSig(sig) { return sig ? sig.split("|").length : 0; }

function setLive(ok) {
  const badge = $("#liveBadge");
  badge.style.opacity = ok ? "1" : ".5";
  badge.title = ok ? "Listening for package updates" : "Reconnecting…";
}

function startListener() {
  // Re-check when the tab regains focus, plus a steady poll.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh({ silent: true });
  });
  setInterval(() => refresh(), CONFIG.pollInterval);
}

/* ---------------------------- toasts ---------------------------- */
function toast(message, icon = "✅") {
  const wrap = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="toast__icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

/* ----------------------------- init ----------------------------- */
function wireUi() {
  $("#cartBtn").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#checkoutBtn").addEventListener("click", checkout);
  $("#backBtn").addEventListener("click", renderOverview);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });

  $("#serverIpText").textContent = CONFIG.serverIp;
  $("#copyIp").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(CONFIG.serverIp);
      toast(`Copied ${CONFIG.serverIp}`, "📋");
    } catch {
      toast("Could not copy — please copy manually", "⚠️");
    }
  });

  $("#year").textContent = new Date().getFullYear();
}

async function init() {
  wireUi();
  // Returning from Tebex login? Finish the basket and head to checkout.
  if (await resumeCheckout()) return;
  renderShoppingAs();
  await loadStoreInfo();
  await refresh();          // first paint
  renderCart();
  startListener();          // begin the package listener
}

document.addEventListener("DOMContentLoaded", init);
