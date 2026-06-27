/* ===========================================================
   Lore — app logic (vanilla JS, Leaflet, no build step)
   Real data from data.js · screen router · 2 themes
   =========================================================== */

const LOGO_SVG = `<svg viewBox="0 0 24 26" fill="none">
  <path d="M2 5 L12 7 L22 5 L22 21 L12 23 L2 21 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <line x1="12" y1="7" x2="12" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="17" y1="7" x2="18" y2="21" stroke="currentColor" stroke-width=".7" opacity=".35"/>
  <path d="M5 19 C5 15 9 15 8 12 C7 9 5 9 6 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="5" cy="19" r="1.3" fill="currentColor"/>
  <circle cx="6" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="6" cy="7" r=".6" fill="currentColor"/>
</svg>`;

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/></svg>',
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5 11 11l-2.5 4.5L13 13z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c4-4.5 7-8 7-11a7 7 0 1 0-14 0c0 3 3 6.5 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M4 9h16M8 3v4M16 3v4M8 14h4"/></svg>',
};

const NAV = [
  { key: "home", label: "Home", icon: "home" },
  { key: "browse", label: "Browse", icon: "browse", count: true },
  { key: "map", label: "Map", icon: "map" },
  { key: "plan", label: "2-Day Plan", icon: "plan" },
];

const S = {
  theme: "A",
  screen: "home",
  cat: null,
  cuisine: null,
  query: "",
  day: "any",
  src: "all",
  must: new Set(),
  mustOnly: false,
  selected: null,
  transport: "walk",
  user: null,
  W: window.innerWidth,
  plan: { interests: CATEGORIES.map(c => c.key), pace: "balanced", maxPrice: 4, walkInOnly: false },
};

const el = id => document.getElementById(id);
const catColor = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));
const catLabel = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));
const catEmoji = Object.fromEntries(CATEGORIES.map(c => [c.key, c.emoji]));
const RES_LABEL = { walkin: "Walk-in", recommended: "Reserve ahead", required: "Reservation req.", ticket: "Timed ticket" };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- geo helpers ---------- */
function distMiles(a, b) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function fmtDist(mi) { return mi < 0.19 ? Math.round(mi * 5280) + " ft" : mi.toFixed(mi < 10 ? 1 : 0) + " mi"; }
function priceStr(p) { return p.priceLevel === 0 ? "Free" : "$".repeat(p.priceLevel); }

function dirUrl(p) {
  const mode = TRANSPORT[S.transport].gmaps;
  let url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(p.address || (p.lat + "," + p.lng)) + "&travelmode=" + mode;
  if (S.user) url += "&origin=" + S.user.lat + "," + S.user.lng;
  return url;
}
const mapsUrl = p => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.address || p.name);

/* ---------- must-go (starred) ---------- */
function toggleMust(id) {
  if (S.must.has(id)) S.must.delete(id); else S.must.add(id);
  try { localStorage.setItem("lore-mustgo", JSON.stringify([...S.must])); } catch (e) {}
  update();
  if (S.selected && el("detail").classList.contains("open")) openDetail(S.selected);
}

/* ---------- filtering ---------- */
function filtered() {
  let list = PLACES.slice();
  if (S.src !== "all") list = list.filter(p => p.source === S.src);
  if (S.cat) list = list.filter(p => p.category === S.cat);
  if (S.cuisine) list = list.filter(p => p.cuisine.includes(S.cuisine));
  if (S.mustOnly) list = list.filter(p => S.must.has(p.id));
  if (S.day !== "any") list = list.filter(p => p.tripStatus[S.day].open);
  if (S.query) {
    const q = S.query.toLowerCase();
    list = list.filter(p => (p.name + " " + p.cuisine.join(" ") + " " + p.blurb + " " + catLabel[p.category]).toLowerCase().includes(q));
  }
  if (S.user) { list.forEach(p => p._d = distMiles(S.user, p)); list.sort((a, b) => a._d - b._d); }
  else {
    const order = CATEGORIES.map(c => c.key);
    list.sort((a, b) => a.source !== b.source ? (a.source === "john" ? -1 : 1) : order.indexOf(a.category) - order.indexOf(b.category));
  }
  return list;
}

/* ===========================================================
   RENDER: shell
   =========================================================== */
function injectLogos() { document.querySelectorAll("[data-logo]").forEach(n => n.innerHTML = LOGO_SVG); }

function renderNav() {
  const total = PLACES.length;
  const item = (n, cls, withIcon) =>
    `<button class="${cls} ${S.screen === n.key ? "on" : ""}" data-nav="${n.key}">${ICONS[n.icon]}<span>${n.label}</span>${n.count ? `<span class="nav-badge">${total}</span>` : ""}</button>`;
  el("sb-nav").innerHTML = NAV.map(n => item(n, "nav-item", true)).join("");
  el("bottom-nav").innerHTML = NAV.map(n =>
    `<button class="bn-item ${S.screen === n.key ? "on" : ""}" data-nav="${n.key}">${ICONS[n.icon]}<span>${n.key === "plan" ? "Plan" : n.label}</span></button>`).join("");
  document.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));
}

function seg(items, cur, attr) {
  return items.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-${attr}="${v}">${l}</button>`).join("");
}

function renderFilters() {
  el("sb-day").innerHTML = seg([["any", "Any"], ["tue", "Tue"], ["wed", "Wed"]], S.day, "day");
  el("hero-day").innerHTML = seg([["any", "Either day"], ["tue", "Tue Jun 30"], ["wed", "Wed Jul 1"]], S.day, "day");
  el("sb-src").innerHTML = seg([["all", "All"], ["john", "🔔 John"]], S.src, "src");

  const counts = {};
  PLACES.forEach(p => { if (S.src === "all" || p.source === S.src) counts[p.category] = (counts[p.category] || 0) + 1; });
  el("sb-cat").innerHTML = `<option value="">All types</option>` +
    CATEGORIES.filter(c => counts[c.key]).map(c => `<option value="${c.key}" ${S.cat === c.key ? "selected" : ""}>${c.label} (${counts[c.key]})</option>`).join("");
  el("sb-cuisine").innerHTML = `<option value="">All cuisines</option>` +
    cuisineOptions().map(c => `<option value="${esc(c)}" ${S.cuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("");

  el("sb-must").classList.toggle("on", S.mustOnly);
  document.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => { S.day = b.dataset.day; update(); }));
  document.querySelectorAll("[data-src]").forEach(b => b.addEventListener("click", () => { S.src = b.dataset.src; S.screen = "browse"; update(); }));
  el("sb-cat").addEventListener("change", () => { S.cat = el("sb-cat").value || null; S.screen = "browse"; update(); });
  el("sb-cuisine").addEventListener("change", () => { S.cuisine = el("sb-cuisine").value || null; S.screen = "browse"; update(); });
}

/* ===========================================================
   RENDER: cards
   =========================================================== */
function cardHTML(p) {
  const dist = S.user && p._d != null ? `<span class="c-dist">${fmtDist(p._d)}</span>` : "";
  return `<button class="card" data-open="${p.id}" style="--cat:${catColor[p.category]}">
    <span class="c-star ${S.must.has(p.id) ? "on" : ""}" data-star="${p.id}" title="${S.must.has(p.id) ? "On your must-go list" : "Add to must-go"}" role="button" aria-label="Toggle must-go">${S.must.has(p.id) ? "★" : "☆"}</span>
    <div class="c-cat">${p.source === "john" ? "🔔 " : ""}${catLabel[p.category]}</div>
    <div class="c-name">${esc(p.name)}</div>
    <div class="c-blurb">${esc(p.blurb)}</div>
    <div class="c-tags">${p.cuisine.slice(0, 3).map(t => `<span class="c-tag">${esc(t)}</span>`).join("")}</div>
    <div class="c-foot"><span class="c-price">${priceStr(p)}</span><span class="c-res">${RES_LABEL[p.reservation]}</span>${dist}</div>
  </button>`;
}

/* ===========================================================
   SCREENS
   =========================================================== */
function screenHome() {
  const johns = filtered().filter(p => p.source === "john");
  const total = PLACES.length;
  const counts = {};
  PLACES.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
  const types = CATEGORIES.filter(c => counts[c.key]).map(c =>
    `<button class="type-chip" data-cat="${c.key}" style="--cat:${c.color}">${c.emoji} ${c.label} <span class="t-count">${counts[c.key]}</span></button>`).join("");

  const mustList = PLACES.filter(p => S.must.has(p.id) && (S.day === "any" || p.tripStatus[S.day].open));
  const mustSection = S.must.size ? `
    <div class="section-head"><h2>⭐ John's must-go</h2><button class="section-link" data-seeall="must">See all →</button></div>
    <div class="grid">${mustList.map(cardHTML).join("")}</div>` : "";

  return `
    ${bannerHTML()}
    ${mustSection}
    <div class="section-head"><h2>John's Picks</h2><button class="section-link" data-seeall="all">See all ${total} places →</button></div>
    <div class="grid">${johns.map(cardHTML).join("") || emptyHTML()}</div>
    <div class="section-head"><h2>Explore by type</h2></div>
    <div class="type-row">${types}</div>`;
}

// Unique cuisines relevant to the current source + category
function cuisineOptions() {
  const base = PLACES.filter(p => (S.src === "all" || p.source === S.src) && (!S.cat || p.category === S.cat));
  const set = new Set();
  base.forEach(p => p.cuisine.forEach(c => set.add(c)));
  if (S.cuisine) set.add(S.cuisine);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Compact filter bar (mobile only — desktop uses the sidebar)
function filterBarHTML() {
  const cats = CATEGORIES.map(c => `<option value="${c.key}" ${S.cat === c.key ? "selected" : ""}>${c.label}</option>`).join("");
  const cuis = cuisineOptions().map(c => `<option value="${esc(c)}" ${S.cuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  return `<div class="filterbar">
    <label class="fb-search"><span class="fb-ic">🔍</span><input id="fb-q" type="search" placeholder="Search places…" value="${esc(S.query)}" autocomplete="off"></label>
    <div class="fb-controls">
      <select id="fb-cat" class="fb-select" aria-label="Category"><option value="">All types</option>${cats}</select>
      <select id="fb-cuisine" class="fb-select" aria-label="Cuisine"><option value="">All cuisines</option>${cuis}</select>
      <button id="fb-john" class="fb-toggle ${S.src === "john" ? "on" : ""}">🔔 John's</button>
      <button id="fb-must" class="fb-toggle ${S.mustOnly ? "on" : ""}">⭐ Must-go</button>
    </div>
  </div>`;
}

function bindFilterBar(onSearch) {
  const cat = el("fb-cat"); if (cat) cat.addEventListener("change", () => { S.cat = cat.value || null; update(); });
  const cui = el("fb-cuisine"); if (cui) cui.addEventListener("change", () => { S.cuisine = cui.value || null; update(); });
  const john = el("fb-john"); if (john) john.addEventListener("click", () => { S.src = S.src === "john" ? "all" : "john"; update(); });
  const must = el("fb-must"); if (must) must.addEventListener("click", () => { S.mustOnly = !S.mustOnly; update(); });
  const q = el("fb-q"); if (q) q.addEventListener("input", () => { S.query = q.value.trim(); onSearch(); });
}

function activeFilterText() {
  const bits = [];
  if (S.mustOnly) bits.push("⭐ must-go");
  if (S.cat) bits.push(catLabel[S.cat]);
  if (S.cuisine) bits.push(S.cuisine);
  if (S.src === "john") bits.push("John's picks");
  if (S.day !== "any") bits.push("open " + (S.day === "tue" ? "Tue" : "Wed"));
  if (S.user) bits.push("near you");
  return bits.length ? " · " + bits.join(" · ") : "";
}

function onQueryChange() {
  if (S.screen === "browse") fillResults();
  else if (S.screen === "map" && MAP) { addPlaceMarkers(); updateMapSub(); }
  else renderScreen();
}

function screenBrowse() {
  return `
    <div class="screen-head"><div class="screen-title">All Places</div></div>
    ${S.W < 1024 ? filterBarHTML() : ""}
    <div id="results"></div>`;
}

function fillResults() {
  const host = el("results"); if (!host) return;
  const list = filtered();
  const body = list.length
    ? `<div class="grid">${list.map(cardHTML).join("")}</div>`
    : (S.mustOnly ? `<div class="empty">No must-go places yet. Tap the ☆ on any place to add it to your list.</div>` : emptyHTML());
  host.innerHTML =
    `<div class="result-count">${list.length} place${list.length === 1 ? "" : "s"}${activeFilterText()}${S.user ? " · sorted by distance" : ""}</div>${body}`;
  host.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.open)));
}

function mapSubText() {
  const n = filtered().length;
  return `Center City Philadelphia · ${n} place${n === 1 ? "" : "s"}${activeFilterText()}${S.user ? " · 📍 your location shown" : ""}`;
}
function updateMapSub() { const s = el("map-sub"); if (s) s.textContent = mapSubText(); }

function screenMap() {
  return `
    <div class="screen-head"><div class="screen-title">Map View</div><div class="screen-sub" id="map-sub">${mapSubText()}</div></div>
    ${S.W < 1024 ? filterBarHTML() : ""}
    <div class="map-wrap"><div id="map"></div></div>`;
}

function screenPlan() {
  return `
    <div class="screen-head"><div class="screen-title">Build your 2-day plan</div><div class="screen-sub">Generated from your preferences — only places open each day, routed to minimize back-tracking.</div></div>
    <div id="plan-config"></div>
    <div class="plan-grid" id="plan-grid"></div>
    <div class="getting" id="getting"></div>`;
}

function bannerHTML() {
  if (typeof BANNER === "undefined" || S._bannerClosed) return "";
  return `<div class="alert"><span class="a-ic">🎆</span><div><strong>${esc(BANNER.title)}</strong><p>${esc(BANNER.body)}</p></div><button class="a-close" data-banner-close>×</button></div>`;
}
const emptyHTML = () => `<div class="empty">No places match these filters.</div>`;

/* ---------- screen dispatch ---------- */
let MAP = null, MARKERS = [], userMarker = null;

function renderScreen() {
  const host = el("screen");
  if (S.screen === "home") host.innerHTML = screenHome();
  else if (S.screen === "browse") { host.innerHTML = screenBrowse(); fillResults(); bindFilterBar(fillResults); }
  else if (S.screen === "map") { host.innerHTML = screenMap(); buildMap(); bindFilterBar(() => { addPlaceMarkers(); updateMapSub(); }); }
  else if (S.screen === "plan") { host.innerHTML = screenPlan(); renderPlan(); }

  // bindings (home type chips + any place cards outside the results region)
  document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.open)));
  document.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { S.cat = S.cat === b.dataset.cat ? null : b.dataset.cat; S.screen = "browse"; update(); }));
  document.querySelectorAll("[data-seeall]").forEach(b => b.addEventListener("click", () => {
    S.cat = null; S.cuisine = null; S.query = ""; S.src = "all";
    S.mustOnly = b.dataset.seeall === "must";
    go("browse");
  }));
  const bc = document.querySelector("[data-banner-close]");
  if (bc) bc.addEventListener("click", () => { S._bannerClosed = true; renderScreen(); });
}

/* ===========================================================
   MAP (real Leaflet)
   =========================================================== */
function pin(color) {
  return L.divIcon({ className: "", html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
}
function addPlaceMarkers() {
  if (!MAP) return;
  MARKERS.forEach(m => MAP.removeLayer(m));
  MARKERS = [];
  const list = filtered(), bounds = [];
  list.forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: pin(catColor[p.category]) }).addTo(MAP);
    m.bindPopup(`<div class="pop"><h4>${p.source === "john" ? "🔔 " : ""}${esc(p.name)}</h4><p>${catLabel[p.category]} · ${priceStr(p)}${S.user && p._d != null ? " · " + fmtDist(p._d) : ""}</p><button onclick="window.__open('${p.id}')">View details</button></div>`);
    MARKERS.push(m); bounds.push([p.lat, p.lng]);
  });
  if (S.user) bounds.push([S.user.lat, S.user.lng]);
  if (bounds.length) { try { MAP.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); } catch (e) {} }
}
function buildMap() {
  if (MAP) { MAP.remove(); MAP = null; MARKERS = []; userMarker = null; }
  MAP = L.map("map", { scrollWheelZoom: true }).setView([39.951, -75.1605], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 20,
  }).addTo(MAP);
  if (S.user) userMarker = L.marker([S.user.lat, S.user.lng], { icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(MAP).bindPopup("<div class='pop'><h4>📍 You are here</h4></div>");
  addPlaceMarkers();
  setTimeout(() => MAP && MAP.invalidateSize(), 60);
  setTimeout(() => MAP && MAP.invalidateSize(), 320);
}
window.__open = id => openDetail(id);

/* ===========================================================
   DETAIL panel / takeover
   =========================================================== */
function bookHTML(p) {
  const b = (typeof BOOKING !== "undefined") && BOOKING[p.id];
  if (!b) return "";
  return `<a class="d-book" href="${b.url}" target="_blank" rel="noopener">${b.platform === "Tickets" ? "🎟️ Book tickets" : "📅 Reserve · " + b.platform}</a>`;
}
function openDetail(id) {
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  S.selected = id;
  const c = catColor[p.category];
  const ds = d => `<div class="ds ${p.tripStatus[d].open ? "open" : "closed"}"><div class="ds-day">${d === "tue" ? "Tue Jun 30" : "Wed Jul 1"}</div>${p.tripStatus[d].open ? "● " : "✕ "}${esc(p.tripStatus[d].text)}</div>`;
  const reviews = p.reviews.map(r => `<div class="d-rev"><div class="r-top">${esc(r.platform)}<span class="r-rate">${esc(r.rating)}</span></div><div class="r-quote">“${esc(r.quote)}”</div></div>`).join("");
  const badges = `<span class="d-badge">${p.source === "john" ? "🔔 John's Pick" : "✨ Also recommended"}</span><span class="d-badge">${RES_LABEL[p.reservation]}</span>`;

  el("detail-body").innerHTML = `
    <div class="d-band" style="background:${c}">
      <button class="d-close" data-detail-close>×</button>
      <button class="d-back" data-detail-close>← Back</button>
      <div class="d-cat">${catLabel[p.category]} · ${p.cuisine.join(" · ")}</div>
      <div class="d-name">${esc(p.name)}</div>
      <div class="d-badges">${badges}<button class="d-starbtn ${S.must.has(p.id) ? "on" : ""}" data-star="${p.id}">${S.must.has(p.id) ? "★ On must-go" : "☆ Must-go"}</button></div>
    </div>
    <div class="d-body">
      <div class="d-status">${ds("tue")}${ds("wed")}</div>
      <div class="d-rows">
        <div class="d-row"><span class="d-ic">💵</span><span>${priceStr(p)} · ${esc(p.priceText)}</span></div>
        <div class="d-row"><span class="d-ic">📍</span><a href="${mapsUrl(p)}" target="_blank" rel="noopener">${esc(p.address)}</a>${S.user && p._d != null ? `<span style="margin-left:auto;color:var(--accent);font-weight:600">${fmtDist(distMiles(S.user, p))}</span>` : ""}</div>
        ${p.phone ? `<div class="d-row"><span class="d-ic">📞</span><a href="tel:${p.phone.replace(/[^0-9+]/g, "")}">${esc(p.phone)}</a></div>` : ""}
        <div class="d-row"><span class="d-ic">🕒</span><span>${esc(p.hours)}</span></div>
        <div class="d-row"><span class="d-ic">🎟️</span><span>${esc(p.resNote)}</span></div>
      </div>
      <div class="d-quote">${esc(p.why)}</div>
      ${p.flag ? `<div class="d-flag">${esc(p.flag)}</div>` : ""}
      <div class="d-reviews">${reviews}</div>
      <div class="d-cta">
        <a class="d-dir" href="${dirUrl(p)}" target="_blank" rel="noopener">${TRANSPORT[S.transport].emoji} Get Directions</a>
        ${bookHTML(p) || (p.website ? `<a class="d-book" href="${p.website}" target="_blank" rel="noopener">🌐 Website</a>` : "")}
      </div>
    </div>`;

  el("detail").classList.add("open");
  el("detail-scrim").classList.add("show");
  el("detail-body").scrollTop = 0;
  document.querySelectorAll("[data-detail-close]").forEach(b => b.addEventListener("click", closeDetail));
}
function closeDetail() {
  S.selected = null;
  el("detail").classList.remove("open");
  el("detail-scrim").classList.remove("show");
}

/* ===========================================================
   PLAN generator (rule-based, no LLM)
   =========================================================== */
const CENTER = { lat: 39.9526, lng: -75.1635 };
const daypartsFor = p => DAYPART_OVERRIDE[p.id] || DAYPART_BY_CAT[p.category] || [];
function pickWeighted(sorted) {
  const top = sorted.slice(0, Math.min(3, sorted.length)), w = [3, 2, 1].slice(0, top.length);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) if ((r -= w[i]) < 0) return top[i].p;
  return top[0].p;
}
function generateDay(dayKey, used) {
  const slots = PACE_SLOTS[S.plan.pace];
  const pool = PLACES.filter(p => p.tripStatus[dayKey].open && p.priceLevel <= S.plan.maxPrice && !(S.plan.walkInOnly && p.reservation === "required"));
  let anchor = S.user || CENTER;
  const usedDay = new Set();
  const blocks = slots.map(slot => {
    const cands = pool.filter(p => !used.has(p.id) && !usedDay.has(p.id) && daypartsFor(p).includes(slot.daypart));
    const matching = cands.filter(p => S.plan.interests.includes(p.category));
    const isMeal = MEAL_DAYPARTS.includes(slot.daypart);
    const useList = matching.length ? matching : (isMeal ? cands : []);
    if (!useList.length) return { slot, place: null };
    const a = anchor;
    const scored = useList.map(p => {
      let s = 0; if (p.source === "john") s += 3; if (S.plan.interests.includes(p.category)) s += 4; s -= distMiles(a, p) * 0.6;
      return { p, s };
    }).sort((x, y) => y.s - x.s);
    const place = pickWeighted(scored);
    usedDay.add(place.id); used.add(place.id); anchor = place;
    return { slot, place };
  });
  const closed = PLACES.filter(p => p.source === "john" && S.plan.interests.includes(p.category) && !p.tripStatus[dayKey].open);
  return { blocks, closed };
}

function renderPlan() {
  // config
  const interestChips = CATEGORIES.map(c => `<button class="cfg-chip ${S.plan.interests.includes(c.key) ? "on" : ""}" data-int="${c.key}" style="${S.plan.interests.includes(c.key) ? "background:" + c.color + ";color:#fff;border-color:transparent" : ""}">${c.emoji} ${c.label}</button>`).join("");
  const segc = (arr, attr, cur) => arr.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-${attr}="${v}">${l}</button>`).join("");
  const loc = S.user ? "📍 Routed from your location" : "Routed from Center City — set location for a tighter route";
  el("plan-config").innerHTML = `<div class="cfg">
    <div class="cfg-row"><span class="sb-label">Interests</span><div class="cfg-chips">${interestChips}</div></div>
    <div class="cfg-row"><span class="sb-label">Pace</span><div class="cfg-seg">${segc([["relaxed", "🌿 Relaxed"], ["balanced", "⚖️ Balanced"], ["packed", "⚡ Packed"]], "pace", S.plan.pace)}</div></div>
    <div class="cfg-row"><span class="sb-label">Max budget</span><div class="cfg-seg">${segc([[1, "$"], [2, "$$"], [3, "$$$"], [4, "$$$$"]], "budget", S.plan.maxPrice)}</div></div>
    <div class="cfg-row"><span class="sb-label">Bookings</span><div class="cfg-seg">${segc([[false, "📅 I'll book ahead"], [true, "✅ Walk-ins only"]], "walk", S.plan.walkInOnly)}</div></div>
    <div class="cfg-row cfg-actions"><button class="btn-accent" id="regen">🎲 Regenerate</button><span class="cfg-loc">${loc}</span></div>
  </div>`;

  document.querySelectorAll("[data-int]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.int, i = S.plan.interests.indexOf(k); i >= 0 ? S.plan.interests.splice(i, 1) : S.plan.interests.push(k); renderPlan(); }));
  document.querySelectorAll("[data-pace]").forEach(b => b.addEventListener("click", () => { S.plan.pace = b.dataset.pace; renderPlan(); }));
  document.querySelectorAll("[data-budget]").forEach(b => b.addEventListener("click", () => { S.plan.maxPrice = +b.dataset.budget; renderPlan(); }));
  document.querySelectorAll("[data-walk]").forEach(b => b.addEventListener("click", () => { S.plan.walkInOnly = b.dataset.walk === "true"; renderPlan(); }));
  el("regen").addEventListener("click", renderPlanDays);

  renderPlanDays();
  renderGetting();
}

function renderPlanDays() {
  const used = new Set();
  el("plan-grid").innerHTML = TRIP_DAYS.map(d => {
    const { blocks, closed } = generateDay(d.key, used);
    const rows = blocks.map(b => {
      if (!b.place) return `<div class="tl-block"><div class="tl-time">${b.slot.time}</div><div><h4>${b.slot.label}</h4><div class="tl-free">Free time — wander &amp; explore ✨</div></div></div>`;
      const p = b.place, resTxt = p.reservation === "walkin" ? "walk-in" : p.reservation === "ticket" ? "ticket" : "reserve";
      const dTxt = S.user ? " · " + fmtDist(distMiles(S.user, p)) : "";
      return `<div class="tl-block"><div class="tl-time">${b.slot.time}</div><div>
        <h4>${b.slot.label}</h4>
        <button class="tl-place" data-open="${p.id}" style="--cat:${catColor[p.category]}">${p.source === "john" ? "🔔 " : ""}${esc(p.name)}</button>
        <div class="tl-meta">${catLabel[p.category]} · ${priceStr(p)} · ${resTxt}${dTxt}</div>
      </div></div>`;
    }).join("");
    const closedNote = closed.length ? `<div class="day-closed">⚠️ Closed ${d.label.split("·")[0].trim()} (skipped): ${closed.map(c => esc(c.name)).join(", ")}</div>` : "";
    return `<div class="day-col"><div class="day-head"><span class="pill-tag">${d.label}</span><h3>${d.full}</h3>${closedNote}</div><div class="tl">${rows}</div></div>`;
  }).join("");
  document.querySelectorAll("#plan-grid [data-open]").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.open)));
}

function renderGetting() {
  const trBtns = Object.values(TRANSPORT).map(t => `<button class="${t.key === S.transport ? "on" : ""}" data-tr="${t.key}">${t.emoji} ${t.label}</button>`).join("");
  const t = TRANSPORT[S.transport];
  el("getting").innerHTML = `<h3>Getting around</h3>
    <div class="tr-toggle">${trBtns}</div>
    <p class="tr-summary">${esc(t.summary)}</p>
    <ul>${t.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  document.querySelectorAll("[data-tr]").forEach(b => b.addEventListener("click", () => { S.transport = b.dataset.tr; renderGetting(); }));
}

/* ===========================================================
   LOCATION
   =========================================================== */
function setUser(lat, lng, label) {
  S.user = { lat, lng };
  const s = el("sb-locstatus"); s.hidden = false; s.classList.remove("err");
  s.textContent = "📍 Near " + label + " — sorted by distance.";
  update();
}
function locStatus(msg, err) { const s = el("sb-locstatus"); s.hidden = false; s.classList.toggle("err", !!err); s.textContent = msg; }
function locate() {
  if (!navigator.geolocation) return locStatus("Geolocation unsupported — type an address.", true);
  locStatus("Locating…");
  navigator.geolocation.getCurrentPosition(
    pos => setUser(pos.coords.latitude, pos.coords.longitude, "your location"),
    () => locStatus("Couldn't get location — type your address instead.", true),
    { enableHighAccuracy: true, timeout: 10000 });
}
async function geocode(q) {
  locStatus("Looking up “" + q + "”…");
  try {
    const query = /phila|pa\b|pennsylvania/i.test(q) ? q : q + ", Philadelphia, PA";
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query));
    const d = await r.json();
    if (!d.length) return locStatus("Couldn't find that address.", true);
    setUser(parseFloat(d[0].lat), parseFloat(d[0].lon), q);
  } catch (e) { locStatus("Lookup failed — try the 📍 button.", true); }
}

/* ===========================================================
   THEME + NAV + UPDATE
   =========================================================== */
function applyTheme() {
  el("app").dataset.theme = S.theme;
  document.documentElement.style.scrollbarColor = (S.theme === "A" ? "rgba(20,18,16,.26)" : "rgba(237,229,216,.20)") + " transparent";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", S.theme === "A" ? "#151008" : "#0e0b08");
  document.querySelectorAll("[data-theme-btn]").forEach(b => b.classList.toggle("on", b.dataset.themeBtn === S.theme));
  try { localStorage.setItem("lore-theme", S.theme); } catch (e) {}
}
function go(screen) { S.screen = screen; closeDetail(); update(); window.scrollTo({ top: 0, behavior: "smooth" }); }

function update() { el("app").dataset.screen = S.screen; renderNav(); renderFilters(); renderScreen(); }

/* ---------- init ---------- */
function init() {
  injectLogos();
  try { const t = localStorage.getItem("lore-theme"); if (t) S.theme = t; } catch (e) {}
  const mustDefault = (typeof MUSTGO !== "undefined") ? MUSTGO : PLACES.filter(p => p.mustGo).map(p => p.id); // John's baked-in picks (shared)
  let mustSaved = [];
  try { mustSaved = JSON.parse(localStorage.getItem("lore-mustgo") || "[]"); } catch (e) {}
  S.must = new Set([...mustDefault, ...mustSaved]);
  applyTheme();

  // star toggles (delegated, capture phase so card clicks don't open the detail)
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-star]");
    if (s) { e.preventDefault(); e.stopPropagation(); toggleMust(s.dataset.star); }
  }, true);

  document.querySelectorAll("[data-theme-btn]").forEach(b => b.addEventListener("click", () => { S.theme = b.dataset.themeBtn; applyTheme(); }));
  el("hero-theme").addEventListener("click", () => { S.theme = S.theme === "A" ? "B" : "A"; applyTheme(); });
  el("sb-locate").addEventListener("click", locate);
  el("sb-addr").addEventListener("keydown", e => { if (e.key === "Enter") { const v = e.target.value.trim(); if (v) geocode(v); } });
  el("sb-q").addEventListener("input", () => {
    S.query = el("sb-q").value.trim();
    if (S.query && S.screen !== "browse" && S.screen !== "map") { S.screen = "browse"; update(); }
    else onQueryChange();
  });
  el("sb-must").addEventListener("click", () => { S.mustOnly = !S.mustOnly; S.screen = "browse"; update(); });
  el("detail-scrim").addEventListener("click", closeDetail);
  window.addEventListener("resize", () => { const w = window.innerWidth; if ((w < 1024) !== (S.W < 1024)) { S.W = w; update(); } S.W = w; });

  update();
}
document.addEventListener("DOMContentLoaded", init);
