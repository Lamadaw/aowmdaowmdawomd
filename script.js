/* ============================================================
   Tebex Headless integration
   Public key: 139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21
   ============================================================ */
const TEBEX_KEY = "139nj-334d4c618fe5ebd3b0444bb60a475fcc2cb12e21";
const API = `https://headless.tebex.io/api/accounts/${TEBEX_KEY}`;
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
    {id:"d2", name:"Tools", packages:[
      {id:201,name:"Netherite Pickaxe Kit",type:"single",total_price:4.99,base_price:4.99,currency:"USD",description:"<ul><li>Efficiency V</li><li>Fortune III</li><li>Unbreaking III</li><li>Mending</li></ul>"},
      {id:202,name:"God Tool Bundle",type:"single",total_price:9.99,base_price:9.99,currency:"USD",description:"<ul><li>Maxed pickaxe, axe & shovel</li><li>Sharpness V sword</li><li>Full enchanted set</li></ul>"}
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
      : "Choose what you'd like and add it to your cart.";
    let body;
    if(!pkgs.length) body = `<div class="state">No packages in this category yet.</div>`;
    else if(isRankCategory(cat)) body = `<div class="rank-block" data-cat="${cat.id}"></div>`;
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
  const price = p.total_price ?? p.base_price ?? 0;
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
  const price = p.total_price ?? p.base_price ?? 0;
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

/* ---------- cart ---------- */
function addToCart(pid){
  const p = findPkg(pid);
  if(!p) return;
  const price = p.total_price ?? p.base_price ?? 0;
  // ask for username first if we don't have one yet
  if(!username){
    openUserModal(()=>doAddToCart(p, price));
    return;
  }
  doAddToCart(p, price);
}
function doAddToCart(p, price){
  const ex = cart.find(c=>c.id===p.id);
  if(ex) ex.qty++;
  else cart.push({id:p.id, name:p.name, price, image:p.image, qty:1});
  renderCart();
  showAddedPopup(p, price);
}

/* ---------- username prompt modal ---------- */
let umAfter = null;
function openUserModal(after){
  umAfter = after || null;
  $("#userModal").classList.add("open");
  $(".user-card").classList.remove("invalid");
  $("#umInput").value = username || "";
  setTimeout(()=>$("#umInput").focus(), 60);
}
function closeUserModal(){ $("#userModal").classList.remove("open"); umAfter = null; }
function submitUserModal(){
  const val = ($("#umInput").value || "").trim();
  if(!/^[A-Za-z0-9_]{3,16}$/.test(val)){
    $(".user-card").classList.add("invalid");
    $("#umInput").focus();
    return;
  }
  setUsernameValue(val);
  const after = umAfter;
  closeUserModal();
  if(typeof after === "function") after();
}
function setUsernameValue(name){
  username = (name || "").trim();
  const ui = $("#userInput"); if(ui) ui.value = username;
  renderCart();
}

/* "Added to cart" confirmation popup */
function showAddedPopup(p, price){
  const sub = p.type === "subscription";
  const img = p.image
    ? `<img src="${p.image}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(p.name).slice(0,2)}'}))">`
    : `<span>${escapeHtml(p.name).slice(0,2)}</span>`;
  $("#addedBody").innerHTML = `
    <div class="added-tick">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
    <h3>Added to cart!</h3>
    <div class="added-item">
      <div class="added-img">${img}</div>
      <div class="added-info"><div class="n">${escapeHtml(p.name)}</div><div class="p">${money(price)}${sub?' / month':''}</div></div>
    </div>
    <div class="added-actions">
      <button class="ab-btn ghost" id="keepShopping">Keep shopping</button>
      <button class="ab-btn primary" id="goCart">View cart</button>
    </div>`;
  $("#addedModal").classList.add("open");
  $("#keepShopping").addEventListener("click", closeAdded);
  $("#goCart").addEventListener("click", ()=>{ closeAdded(); openCart(); });
}
function closeAdded(){ $("#addedModal").classList.remove("open"); }

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
async function checkout(){
  const btn = $("#checkoutBtn");
  if(!cart.length) return;
  if(!username){
    closeCart();
    openUserModal(()=>checkout());
    return;
  }
  btn.disabled = true; btn.textContent = "Creating basket…";
  try{
    // 1) create basket
    const bRes = await fetch(`${API}/baskets`, {
      method:"POST",
      headers:{"Content-Type":"application/json", Accept:"application/json"},
      body: JSON.stringify({
        username: username,
        complete_url: location.href,
        cancel_url: location.href,
        complete_auto_redirect: true
      })
    });
    if(!bRes.ok) throw new Error("basket "+bRes.status);
    const basket = (await bRes.json()).data;
    const ident = basket.ident;

    // 2) Minecraft baskets must be authenticated to the username before adding packages
    const authRes = await fetch(`${API}/baskets/${ident}/auth?returnUrl=${encodeURIComponent(location.href)}`, {headers:{Accept:"application/json"}});
    if(authRes.ok){
      const auths = await authRes.json();
      if(Array.isArray(auths) && auths.length && auths[0].url){
        // stash the cart + basket so we can resume after auth redirect
        sessionStorage.setItem("ls_pending", JSON.stringify({ident, cart}));
        location.href = auths[0].url;
        return;
      }
    }
    // 3) no auth needed -> add packages now and go to checkout
    await addAllAndCheckout(ident);
  }catch(err){
    console.error(err);
    toast("Checkout couldn't start — see note below");
    $("#checkoutNote").textContent = "Couldn't reach Tebex checkout from here. This works once the site is hosted on your live domain (Tebex restricts cross-origin requests).";
    btn.disabled = false; btn.textContent = "Checkout";
  }
}

async function addAllAndCheckout(ident){
  for(const item of cart){
    await fetch(`https://headless.tebex.io/api/baskets/${ident}/packages`, {
      method:"POST",
      headers:{"Content-Type":"application/json", Accept:"application/json"},
      body: JSON.stringify({package_id:item.id, quantity:item.qty})
    });
  }
  // fetch basket to get checkout link
  const r = await fetch(`${API}/baskets/${ident}`, {headers:{Accept:"application/json"}});
  const data = (await r.json()).data;
  const url = data?.links?.checkout || data?.links?.payment;
  if(url){ location.href = url; }
  else { throw new Error("no checkout link"); }
}

/* resume after auth redirect */
async function resumePending(){
  const raw = sessionStorage.getItem("ls_pending");
  if(!raw) return false;
  sessionStorage.removeItem("ls_pending");
  try{
    const {ident, cart:savedCart} = JSON.parse(raw);
    cart = savedCart || [];
    renderCart();
    await addAllAndCheckout(ident);
    return true;
  }catch(e){ console.warn(e); return false; }
}

/* ---------- events ---------- */
$("#cartBtn").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#checkoutBtn").addEventListener("click", checkout);
$("#pkgArea").addEventListener("click",(e)=>{
  const tab = e.target.closest(".rank-tab");
  if(tab){
    const cid = tab.dataset.tab;
    activeRank[cid] = tab.dataset.id;
    const cat = categories.find(c=>String(c.id)===String(cid));
    if(cat) renderRankBlock(cat);
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
$("#addedModal").addEventListener("click",(e)=>{ if(e.target.id==="addedModal") closeAdded(); });
$("#umContinue").addEventListener("click", submitUserModal);
$("#umClose").addEventListener("click", closeUserModal);
$("#userModal").addEventListener("click",(e)=>{ if(e.target.id==="userModal") closeUserModal(); });
$("#umInput").addEventListener("keydown",(e)=>{ if(e.key==="Enter") submitUserModal(); });
$("#umInput").addEventListener("input",()=>$(".user-card").classList.remove("invalid"));
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape"){ closeCart(); closeAdded(); closeUserModal(); } });

/* ---------- init ---------- */
(async ()=>{
  await loadStore();
  await resumePending();
})();
