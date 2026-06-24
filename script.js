/* ============================================================
   Tebex Headless integration
   Public key: 139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21
   ============================================================ */
const TEBEX_KEY = "139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21";
const API = `https://headless.tebex.io/api/accounts/${TEBEX_KEY}`;

// Floodgate prefix added to BEDROCK usernames before sending to Tebex.
// Must match your server's Floodgate config (username-prefix). Default is ".".
// Use "." or "!" — Tebex rejects "+" and "-". Set to "" if your server has no prefix.
const BEDROCK_PREFIX = ".";

// Category names (lowercase) to hide from the store entirely.
const HIDE_CATEGORIES = ["tools"];

const CARD_THEMES = ["green","blue","purple","teal","amber"];
const CARD_ART = {ranks:"🦙",tools:"⛏️",crates:"🗝️",gems:"💎",keys:"🗝️",coins:"🪙",tags:"🏷️",cosmetics:"✨",kits:"🎁",default:"🟩"};

let categories = [];
let currency = "USD";
let cart = [];           // {id, name, price, image, qty}
let username = "";

const $ = (s)=>document.querySelector(s);

/* ---------- helpers ---------- */
function money(n){
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return sym + Number(n||0).toFixed(2);
}
function artFor(name){
  const k = (name||"").toLowerCase();
  for(const key in CARD_ART){ if(k.includes(key)) return CARD_ART[key]; }
  return CARD_ART.default;
}
function stripHtml(html){
  const t = document.createElement("div"); t.innerHTML = html||"";
  return (t.textContent||"").trim();
}
/* turn description into perk bullets if it looks like a list, else short text */
function descToHtml(html){
  if(!html) return "";
  const div = document.createElement("div"); div.innerHTML = html;
  const lis = [...div.querySelectorAll("li")].map(li=>li.textContent.trim()).filter(Boolean);
  if(lis.length){
    return "<ul>"+lis.slice(0,6).map(t=>`<li>${escapeHtml(t)}</li>`).join("")+"</ul>";
  }
  const txt = (div.textContent||"").trim().replace(/\s+/g," ");
  return escapeHtml(txt.length>140 ? txt.slice(0,140)+"…" : txt);
}
function escapeHtml(s){return (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(msg){const t=$("#toast");$("#toastMsg").textContent=msg;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2200);}

/* ---------- data load ---------- */
async function loadStore(){
  try{
    const res = await fetch(`${API}/categories?includePackages=1`, {headers:{Accept:"application/json"}});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const json = await res.json();
    const data = json.data || [];
    categories = data
      .filter(c => (c.packages||[]).length || c.only_subcategories === false)
      .filter(c => !HIDE_CATEGORIES.includes((c.name||"").toLowerCase().trim()))
      .sort((a,b)=>(a.order||0)-(b.order||0));
    // detect currency from first package
    for(const c of categories){
      if(c.packages && c.packages[0]){ currency = c.packages[0].currency || currency; break; }
    }
    if(!categories.length) throw new Error("No categories");
    renderCategories();
    renderSections();
  }catch(err){
    console.warn("Tebex load failed, showing demo content:", err);
    loadDemo();
  }
}

/* demo fallback so the page always looks complete */
function loadDemo(){
  currency = "USD";
  categories = [
    {id:"d1", name:"Ranks", packages:[
      {id:101,name:"Lama+",type:"subscription",total_price:6.99,base_price:6.99,currency:"USD",description:"<ul><li>Colored name & chat prefix</li><li>2x Player Vaults</li><li>5 Home slots</li><li>/fly in spawn</li><li>Tab priority</li></ul>"},
      {id:102,name:"Lama++",type:"subscription",total_price:12.99,base_price:12.99,currency:"USD",description:"<ul><li>Everything in Lama+</li><li>4x Player Vaults</li><li>10 Home slots</li><li>Particle trails</li><li>Monthly crate keys</li></ul>"},
      {id:103,name:"Lama MVP",type:"single",total_price:19.99,base_price:19.99,currency:"USD",description:"<ul><li>Everything in Lama++</li><li>Custom join message</li><li>Nickname command</li><li>Priority support</li></ul>"}
    ]},
    {id:"d2", name:"Crates", packages:[
      {id:201,name:"Common Key",type:"single",total_price:0.99,base_price:0.99,currency:"USD",description:"Opens a Common crate for a chance at handy rewards."},
      {id:202,name:"Rare Key",type:"single",total_price:2.49,base_price:2.49,currency:"USD",description:"Opens a Rare crate with better loot odds."},
      {id:203,name:"Legendary Key",type:"single",total_price:4.99,base_price:4.99,currency:"USD",description:"Opens a Legendary crate for the best rewards."}
    ]}
  ];
  renderCategories();
  renderSections();
  $("#checkoutNote").textContent = "Demo mode — couldn't reach Tebex from this page. Live products load when hosted on your own domain.";
}

/* ---------- render categories ---------- */
function renderCategories(){
  const grid = $("#catGrid");
  grid.innerHTML = categories.map((c,i)=>{
    const theme = i===0 ? "green" : CARD_THEMES[(i % (CARD_THEMES.length-1))+1] || "blue";
    const single = categories.length===1 || (categories.length%2===1 && i===categories.length-1);
    return `<a class="cat-card ${theme} ${single?'single':''}" data-id="${c.id}">
      <div class="ttl">${escapeHtml((c.name||"").toUpperCase())}</div>
      <div class="view">Click to view <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
      <div class="art">${artFor(c.name)}</div>
    </a>`;
  }).join("");
  grid.querySelectorAll(".cat-card").forEach(el=>{
    el.addEventListener("click",()=>scrollToCat(el.dataset.id));
  });
}

/* ---------- render packages of a category ---------- */
function isRankCategory(cat){
  return /rank/i.test(cat.name || "");
}
function isCrateCategory(cat){
  return /crate|key/i.test(cat.name || "");
}
function parseDescription(html){
  if(!html) return {items:[], isList:false};
  const div = document.createElement("div");
  const lis = (() => { div.innerHTML = html; return [...div.querySelectorAll("li")].map(li=>li.textContent.trim()).filter(Boolean); })();
  if(lis.length) return {items:lis, isList:true};

  // no <li>: turn block tags / breaks into newlines, then split
  const normalized = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n");
  div.innerHTML = normalized;
  let text = (div.textContent || "").replace(/\u00a0/g, " ");

  let lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  // single blob containing inline bullet separators -> split it
  if(lines.length === 1 && /[•·|✔✓●▪]/.test(lines[0])){
    lines = lines[0].split(/\s*[•·|✔✓●▪]\s*/).map(s=>s.trim()).filter(Boolean);
  }
  // strip any leading bullet/dash markers
  lines = lines.map(s => s.replace(/^[\s+\-–—•·*✔✓●▪]+/, "").trim()).filter(Boolean);

  if(lines.length > 1) return {items:lines, isList:true};
  if(lines.length === 1) return {items:lines, isList:false}; // prose
  return {items:[], isList:false};
}

const activeRank = {}; // catId -> active pkgId

/* package lookup across all categories */
function findPkg(id){
  for(const c of categories){
    const p = (c.packages||[]).find(x=>String(x.id)===String(id));
    if(p) return p;
  }
  return null;
}

/* render every category stacked, one section after another */
function renderSections(){
  const area = $("#pkgArea");
  area.innerHTML = categories.map(cat=>{
    const pkgs = cat.packages || [];
    const sub = isRankCategory(cat)
      ? "Pick a rank to unlock exclusive perks and support the server."
      : isCrateCategory(cat)
        ? "Unlock rewards with keys. Choose a quantity and add to cart."
        : "Choose what you'd like and add it to your cart.";
    let body;
    if(!pkgs.length) body = `<div class="state">No packages in this category yet.</div>`;
    else if(isRankCategory(cat)) body = `<div class="rank-block" data-cat="${cat.id}"></div>`;
    else if(isCrateCategory(cat)) body = `<div class="pkg-grid">${pkgs.map(p=>crateCard(p)).join("")}</div>`;
    else body = `<div class="pkg-grid">${pkgs.map(p=>pkgCard(p)).join("")}</div>`;
    return `<section class="cat-section" id="cat-${cat.id}">
      <div class="section-head"><h2>${escapeHtml(cat.name)}</h2><p>${escapeHtml(sub)}</p></div>
      ${body}
    </section>`;
  }).join("");
  categories.forEach(cat=>{ if(isRankCategory(cat) && (cat.packages||[]).length) renderRankBlock(cat); });
}

function scrollToCat(id){
  const el = document.getElementById("cat-"+id);
  if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
}

/* rank selector tabs + big featured card inside a category section */
function renderRankBlock(cat){
  const pkgs = cat.packages || [];
  if(!pkgs.length) return;
  const cur = activeRank[cat.id];
  if(!cur || !pkgs.some(p=>String(p.id)===String(cur))) activeRank[cat.id] = pkgs[0].id;
  const block = document.querySelector(`.rank-block[data-cat="${cat.id}"]`);
  if(!block) return;
  const tabs = pkgs.map(p=>
    `<button class="rank-tab ${String(p.id)===String(activeRank[cat.id])?'active':''}" data-tab="${cat.id}" data-id="${p.id}">${escapeHtml(p.name)}</button>`
  ).join("");
  block.innerHTML = `<div class="rank-tabs">${tabs}</div><div class="rank-feature-wrap"></div>`;
  drawRankFeature(cat);
}

function drawRankFeature(cat){
  const pkgs = cat.packages || [];
  const p = pkgs.find(x=>String(x.id)===String(activeRank[cat.id])) || pkgs[0];
  if(!p) return;
  const price = p.base_price ?? p.total_price ?? 0;
  const sub = p.type === "subscription";
  const {items, isList} = parseDescription(p.description);
  const desc = items.length
    ? (isList
        ? `<ul class="rf-perks">${items.map(t=>`<li>${escapeHtml(t)}</li>`).join("")}</ul>`
        : `<p class="rf-desc">${escapeHtml(items[0])}</p>`)
    : `<p class="rf-desc rf-desc-empty">Unlock exclusive perks on the server.</p>`;
  const icon = p.image
    ? `<img src="${p.image}" alt="" onerror="this.style.display='none'">`
    : `<span>${escapeHtml(p.name).slice(0,1)}</span>`;
  const art = p.image
    ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'rf-art-word',textContent:'${escapeHtml(p.name)}'}))">`
    : `<div class="rf-art-word">${escapeHtml(p.name)}</div>`;
  const wrap = document.querySelector(`.rank-block[data-cat="${cat.id}"] .rank-feature-wrap`);
  if(!wrap) return;
  wrap.innerHTML = `
    <div class="rank-feature">
      <div class="rf-left">
        <div class="rf-head"><div class="rf-icon">${icon}</div><h2>${escapeHtml(p.name)}</h2></div>
        ${desc}
        <div class="rf-buy">
          <div class="rf-price">${money(price)}${sub?'<small>PER MONTH</small>':''}</div>
          <button class="rf-add" data-id="${p.id}">ADD TO CART</button>
        </div>
      </div>
      <div class="rf-art">${art}</div>
    </div>`;
}

function pkgCard(p){
  const price = p.base_price ?? p.total_price ?? 0;
  const sub = p.type === "subscription";
  const img = p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="fallback" style="display:none">${escapeHtml(p.name)}</span>`
                      : `<span class="fallback">${escapeHtml(p.name)}</span>`;
  return `<div class="pkg">
    <div class="media">${p.type?`<div class="tag">${escapeHtml(sub?'Subscription':p.type)}</div>`:""}${img}</div>
    <div class="body">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="desc">${descToHtml(p.description)}</div>
      <div class="foot">
        <div class="price">${money(price)}${sub?' <small>/mo</small>':''}</div>
        <button class="add" data-id="${p.id}">Add to cart</button>
      </div>
    </div>
  </div>`;
}

/* crate / key card with quantity selector */
function crateCard(p){
  const price = p.base_price ?? p.total_price ?? 0;
  const img = p.image
    ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="fallback" style="display:none">🗝️</span>`
    : `<span class="fallback">🗝️</span>`;
  const qtys = [1,5,10,20];
  return `<div class="crate" data-id="${p.id}">
    <div class="crate-media">${img}</div>
    <h3>${escapeHtml(p.name)}</h3>
    <div class="crate-price">${money(price)}</div>
    <div class="crate-qtys">
      ${qtys.map((q,i)=>`<button class="crate-qty ${i===0?'active':''}" data-qty="${q}">${q}x</button>`).join("")}
    </div>
    <button class="crate-add" data-id="${p.id}">ADD TO CART</button>
  </div>`;
}

/* ---------- cart ---------- */
function addToCart(pid, qty){
  const p = findPkg(pid);
  if(!p) return;
  const price = p.base_price ?? p.total_price ?? 0;
  const q = Math.max(1, parseInt(qty) || 1);
  // ask for username first if we don't have one yet
  if(!username){
    openUserModal(()=>doAddToCart(p, price, q));
    return;
  }
  doAddToCart(p, price, q);
}
function doAddToCart(p, price, qty){
  const q = Math.max(1, parseInt(qty) || 1);
  const ex = cart.find(c=>c.id===p.id);
  if(ex) ex.qty += q;
  else cart.push({id:p.id, name:p.name, price, image:p.image, qty:q});
  renderCart();
  toast(`${p.name} added to cart`);
}

/* ---------- username prompt modal ---------- */
let umAfter = null;
let userPlatform = "java"; // 'java' | 'bedrock'

const PLAT_RULES = {
  java:    { re:/^[A-Za-z0-9_]{3,16}$/,    ph:"e.g. Notch",         hint:"3–16 characters. Letters, numbers and underscores only." },
  bedrock: { re:/^[A-Za-z0-9 ._-]{2,24}$/, ph:"e.g. Your Gamertag",  hint:"Your Bedrock gamertag (spaces are allowed)." }
};

function setPlatform(plat){
  userPlatform = (plat === "bedrock") ? "bedrock" : "java";
  document.querySelectorAll(".um-plat").forEach(b=>{
    b.classList.toggle("active", b.dataset.plat === userPlatform);
  });
  const rule = PLAT_RULES[userPlatform];
  const inp = $("#umInput");
  inp.placeholder = rule.ph;
  $("#umHint").textContent = rule.hint;
  $(".user-card").classList.remove("invalid");
  updateFacePreview();
}

function openUserModal(after){
  umAfter = after || null;
  $("#userModal").classList.add("open");
  $(".user-card").classList.remove("invalid");
  setPlatform(userPlatform);
  let shown = username || "";
  if(userPlatform === "bedrock" && BEDROCK_PREFIX && shown.startsWith(BEDROCK_PREFIX)){
    shown = shown.slice(BEDROCK_PREFIX.length);
  }
  $("#umInput").value = shown;
  updateFacePreview();
  setTimeout(()=>$("#umInput").focus(), 60);
}
function closeUserModal(){ $("#userModal").classList.remove("open"); umAfter = null; }
function submitUserModal(){
  const val = ($("#umInput").value || "").trim();
  if(!PLAT_RULES[userPlatform].re.test(val)){
    $(".user-card").classList.add("invalid");
    $("#umHint").textContent = !val
      ? "Please enter your username first."
      : (userPlatform === "bedrock"
          ? "That doesn't look like a valid gamertag (2–24 characters)."
          : "That username isn't valid — letters, numbers and underscores only.");
    $("#umInput").focus();
    return;
  }
  // Bedrock names need the Floodgate prefix so Tebex delivers to the right account
  const finalName = (userPlatform === "bedrock" && BEDROCK_PREFIX) ? (BEDROCK_PREFIX + val) : val;
  setUsernameValue(finalName);
  const after = umAfter;
  closeUserModal();
  if(typeof after === "function") after();
}
function setUsernameValue(name){
  username = (name || "").trim();
  const ui = $("#userInput"); if(ui) ui.value = username;
  renderCart();
}

/* live face preview in the username modal */
let faceTimer = null;
function updateFacePreview(){
  const box = $("#umFace"), img = $("#umFaceImg");
  const val = ($("#umInput").value || "").trim();
  const valid = userPlatform === "java"
    ? /^[A-Za-z0-9_]{3,16}$/.test(val)
    : /^[A-Za-z0-9 ._-]{2,24}$/.test(val);
  if(valid){
    loadFace(img, val);
    $("#umFaceName").textContent = val;
    box.classList.add("show");
  }else{
    box.classList.remove("show");
  }
}
function scheduleFacePreview(){ clearTimeout(faceTimer); faceTimer = setTimeout(updateFacePreview, 350); }

/* ---------- cart drawer ---------- */
function removeFromCart(pid){ cart = cart.filter(c=>String(c.id)!==String(pid)); renderCart(); }

function renderCart(){
  const count = cart.reduce((s,c)=>s+c.qty,0);
  const cc = $("#cartCount");
  cc.textContent = count; cc.style.display = count ? "grid" : "none";
  const total = cart.reduce((s,c)=>s+c.price*c.qty,0);
  $("#cartTotal").textContent = money(total);
  const wrap = $("#cartItems");
  if(!cart.length){
    wrap.innerHTML = `<div class="cart-empty">Your cart is empty.</div>`;
    $("#checkoutBtn").disabled = true;
    if(!username) $("#checkoutNote").textContent = "Add items to your cart to continue.";
    return;
  }
  wrap.innerHTML = cart.map(c=>`
    <div class="ci">
      <div class="ci-img">${c.image?`<img src="${c.image}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(c.name).slice(0,2)}'}))">`:`<span>${escapeHtml(c.name).slice(0,2)}</span>`}</div>
      <div class="ci-info"><div class="n">${escapeHtml(c.name)}${c.qty>1?` ×${c.qty}`:""}</div><div class="p">${money(c.price*c.qty)}</div></div>
      <button class="rm" data-id="${c.id}">remove</button>
    </div>`).join("");
  wrap.querySelectorAll(".rm").forEach(b=>b.addEventListener("click",()=>removeFromCart(b.dataset.id)));
  $("#checkoutBtn").disabled = false;
  $("#checkoutNote").textContent = username ? `Perks deliver to: ${username}` : "Tip: set your username above before checkout.";
}

function openCart(){ $("#drawer").classList.add("open"); $("#overlay").classList.add("open"); }
function closeCart(){ $("#drawer").classList.remove("open"); $("#overlay").classList.remove("open"); }

/* ---------- username (now lives in the cart) ---------- */
function syncUsername(){
  username = ($("#userInput").value || "").trim();
  renderCart();
}

/* ---------- checkout (Tebex Headless basket) ---------- */
/* fetch helper that surfaces the real Tebex error message */
async function tebexApi(url, opts={}){
  const headers = { Accept:"application/json", ...(opts.headers||{}) };
  if(opts.body) headers["Content-Type"] = "application/json";
  let res;
  try{
    res = await fetch(url, { ...opts, headers });
  }catch(netErr){
    throw new Error("Network/blocked request (" + (netErr.message||"failed to fetch") + ")");
  }
  let body = null;
  try{ body = await res.clone().json(); }catch(e){}
  if(!res.ok){
    const msg = (body && (body.detail || body.title || body.error_message || body.message)) || ("HTTP " + res.status);
    throw new Error(msg + " [" + res.status + "]");
  }
  return body;
}

function checkoutFailed(err){
  const msg = (err && err.message) ? err.message : "Unknown error";
  console.error("Checkout failed:", err);
  toast("Checkout error — see note below");
  $("#checkoutNote").textContent =
    "Checkout error: " + msg +
    ". If it mentions an invalid username or verification, set your Tebex store to offline/Geyser (turn off username verification).";
}

/* show a Tebex-style checkout menu before sending to Tebex */
function openConfirm(){
  if(!cart.length) return;
  renderConfirm();
  closeCart();
  $("#confirmModal").classList.add("open");
}
/* load a Minecraft face by username, trying several services */
function loadFace(imgEl, name){
  const clean = (name || "").replace(/^[.!]/,"").trim();
  if(!clean){ imgEl.style.visibility = "hidden"; return; }
  const enc = encodeURIComponent(clean);
  const sources = [
    `https://minotar.net/helm/${enc}/96.png`,
    `https://crafthead.net/helm/${enc}`,
    `https://mc-heads.net/avatar/${enc}/96`
  ];
  let i = 0;
  imgEl.style.visibility = "";
  imgEl.onerror = ()=>{ i++; if(i < sources.length){ imgEl.src = sources[i]; } else { imgEl.style.visibility = "hidden"; } };
  imgEl.src = sources[0];
}

function renderConfirm(){
  // signed-in user
  $("#confirmName").textContent = username || "Not set yet";
  const av = $("#confirmAv");
  if(username){
    av.style.display = "";
    loadFace(av, username);
  }else{
    av.style.display = "none";
  }
  $("#confirmCurrency").textContent = currency || "USD";

  // line items with quantity steppers
  $("#confirmItems").innerHTML = cart.map(c=>{
    const init = escapeHtml(c.name).slice(0,2);
    const img = c.image
      ? `<img src="${c.image}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${init}'}))">`
      : `<span>${init}</span>`;
    return `<div class="co-row">
      <div class="co-name"><div class="ci-img">${img}</div><span>${escapeHtml(c.name)}</span></div>
      <div class="co-price">${money(c.price*c.qty)}</div>
      <div class="co-qty">
        <div class="co-stepper">
          <button class="co-step" data-act="dec" data-id="${c.id}" aria-label="Decrease">−</button>
          <span class="co-qn">${c.qty}</span>
          <button class="co-step" data-act="inc" data-id="${c.id}" aria-label="Increase">+</button>
        </div>
        <button class="co-remove" data-id="${c.id}" aria-label="Remove">×</button>
      </div>
    </div>`;
  }).join("");

  const total = cart.reduce((s,c)=>s+c.price*c.qty,0);
  $("#confirmTotal").textContent = money(total);
}
function closeConfirm(){ $("#confirmModal").classList.remove("open"); }

async function proceedCheckout(){
  const btn = $("#checkoutBtn");
  if(!cart.length) return;
  if(!username){
    closeCart();
    openUserModal(()=>proceedCheckout());
    return;
  }
  btn.disabled = true; btn.textContent = "Starting checkout…";
  try{
    // 1) create the basket (providing username identifies the player)
    const basket = await tebexApi(`${API}/baskets`, {
      method:"POST",
      body: JSON.stringify({
        username: username,
        complete_url: location.href,
        cancel_url: location.href,
        complete_auto_redirect: true
      })
    });
    const ident = basket?.data?.ident;
    if(!ident) throw new Error("No basket id returned");

    // 2) add every cart item to the basket FIRST (so checkout isn't empty)
    for(const item of cart){
      await tebexApi(`https://headless.tebex.io/api/baskets/${ident}/packages`, {
        method:"POST",
        body: JSON.stringify({ package_id: item.id, quantity: item.qty })
      });
    }

    // 3) fetch the basket to get its checkout link
    const full = await tebexApi(`${API}/baskets/${ident}`);
    const checkoutUrl = full?.data?.links?.checkout || full?.data?.links?.payment;
    if(!checkoutUrl) throw new Error("No checkout link returned by Tebex");

    // 4) if the store requires login, go through auth (returning to the filled checkout)
    let auths = [];
    try{
      auths = await tebexApi(`${API}/baskets/${ident}/auth?returnUrl=${encodeURIComponent(checkoutUrl)}`);
    }catch(e){ /* offline/Geyser stores may not return auth links */ }

    location.href = (Array.isArray(auths) && auths.length && auths[0].url) ? auths[0].url : checkoutUrl;
  }catch(err){
    checkoutFailed(err);
    btn.disabled = false; btn.textContent = "Checkout";
  }
}

/* ---------- events ---------- */
$("#cartBtn").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#checkoutBtn").addEventListener("click", openConfirm);
$("#confirmGo").addEventListener("click", ()=>{ closeConfirm(); proceedCheckout(); });
$("#confirmClose").addEventListener("click", closeConfirm);
$("#confirmSwitch").addEventListener("click", ()=>{ closeConfirm(); openUserModal(()=>openConfirm()); });
$("#confirmModal").addEventListener("click",(e)=>{
  if(e.target.id==="confirmModal"){ closeConfirm(); return; }
  const step = e.target.closest(".co-step");
  if(step){
    const c = cart.find(x=>String(x.id)===String(step.dataset.id));
    if(c){
      c.qty = step.dataset.act==="inc" ? c.qty+1 : Math.max(1, c.qty-1);
      renderCart();
      renderConfirm();
    }
    return;
  }
  const rm = e.target.closest(".co-remove");
  if(rm){
    removeFromCart(rm.dataset.id);
    if(!cart.length) closeConfirm();
    else renderConfirm();
  }
});
$("#pkgArea").addEventListener("click",(e)=>{
  const tab = e.target.closest(".rank-tab");
  if(tab){
    const cid = tab.dataset.tab;
    activeRank[cid] = tab.dataset.id;
    const cat = categories.find(c=>String(c.id)===String(cid));
    if(cat) renderRankBlock(cat);
    return;
  }
  // crate quantity selector
  const qbtn = e.target.closest(".crate-qty");
  if(qbtn){
    const card = qbtn.closest(".crate");
    card.querySelectorAll(".crate-qty").forEach(b=>b.classList.toggle("active", b===qbtn));
    return;
  }
  // crate add-to-cart (uses selected quantity)
  const cadd = e.target.closest(".crate-add");
  if(cadd){
    const card = cadd.closest(".crate");
    const active = card.querySelector(".crate-qty.active");
    const qty = active ? parseInt(active.dataset.qty) : 1;
    addToCart(cadd.dataset.id, qty);
    return;
  }
  const add = e.target.closest(".add, .rf-add");
  if(add){ addToCart(add.dataset.id); }
});
$("#userInput").addEventListener("input", syncUsername);
$("#yr").textContent = new Date().getFullYear();

/* ---------- server IP copy pill ---------- */
$("#ipPill").addEventListener("click", async ()=>{
  const pill = $("#ipPill");
  const span = pill.querySelector("span");
  const ip = span.textContent.trim();
  try{ await navigator.clipboard.writeText(ip); }catch(e){}
  const orig = ip;
  pill.classList.add("copied"); span.textContent = "Copied!";
  toast("Server IP copied!");
  setTimeout(()=>{ pill.classList.remove("copied"); span.textContent = orig; }, 1400);
});
$("#umContinue").addEventListener("click", submitUserModal);
$("#umClose").addEventListener("click", closeUserModal);
$("#umPlatform").addEventListener("click",(e)=>{ const b=e.target.closest(".um-plat"); if(b) setPlatform(b.dataset.plat); });
$("#userModal").addEventListener("click",(e)=>{ if(e.target.id==="userModal") closeUserModal(); });
$("#umInput").addEventListener("keydown",(e)=>{ if(e.key==="Enter") submitUserModal(); });
$("#umInput").addEventListener("input",()=>{ $(".user-card").classList.remove("invalid"); $("#umHint").textContent = PLAT_RULES[userPlatform].hint; scheduleFacePreview(); });
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape"){ closeCart(); closeUserModal(); closeConfirm(); } });

/* ---------- init ---------- */
(async ()=>{
  await loadStore();
})();
