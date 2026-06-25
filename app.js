/* ===========================================================
   Philly Guide — app logic
   Pure vanilla JS + Leaflet. No build step.
   =========================================================== */

const state = {
  source: "all",
  category: "all",
  day: "any",        // any | tue | wed
  openOnly: false,
  query: "",
  transport: "walk",
  user: null,        // { lat, lng }
};

const catColor = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));
const catLabel = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));
const catEmoji = Object.fromEntries(CATEGORIES.map(c => [c.key, c.emoji]));

let map, markers = {}, userMarker = null;
const el = id => document.getElementById(id);

/* ---------- Distance (haversine, miles) ---------- */
function distMiles(a, b) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function fmtDist(mi) {
  if (mi < 0.19) return Math.round(mi * 5280) + " ft";
  return mi.toFixed(mi < 10 ? 1 : 0) + " mi";
}

/* ---------- Day status helper ---------- */
function dayInfo(p) {
  if (state.day === "tue") return p.tripStatus.tue;
  if (state.day === "wed") return p.tripStatus.wed;
  // "any": open if open either day
  return { open: p.tripStatus.tue.open || p.tripStatus.wed.open, text: "" };
}

/* ---------- Filtering ---------- */
function filtered() {
  let list = PLACES.slice();
  if (state.source !== "all") list = list.filter(p => p.source === state.source);
  if (state.category !== "all") list = list.filter(p => p.category === state.category);
  if (state.openOnly && state.day !== "any") list = list.filter(p => dayInfo(p).open);
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter(p =>
      (p.name + " " + p.cuisine.join(" ") + " " + p.blurb + " " + catLabel[p.category])
        .toLowerCase().includes(q));
  }
  if (state.user) {
    list.forEach(p => p._d = distMiles(state.user, p));
    list.sort((a, b) => a._d - b._d);
  } else {
    // John's picks first, then by category order
    const order = CATEGORIES.map(c => c.key);
    list.sort((a, b) => {
      if (a.source !== b.source) return a.source === "john" ? -1 : 1;
      return order.indexOf(a.category) - order.indexOf(b.category);
    });
  }
  return list;
}

/* ---------- Google Maps directions URL ---------- */
function dirUrl(p) {
  const mode = TRANSPORT[state.transport].gmaps;
  const dest = encodeURIComponent(p.address || (p.lat + "," + p.lng));
  let url = "https://www.google.com/maps/dir/?api=1&destination=" + dest + "&travelmode=" + mode;
  if (state.user) url += "&origin=" + state.user.lat + "," + state.user.lng;
  return url;
}
function mapsUrl(p) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.address || p.name);
}

/* ---------- Card rendering ---------- */
const resLabel = { walkin: "✅ Walk-in", recommended: "📅 Reserve ahead", required: "🔒 Reservation req.", ticket: "🎟️ Timed ticket" };

function priceStr(p) {
  if (p.priceLevel === 0) return "Free";
  return "$".repeat(p.priceLevel);
}

function bookHTML(p) {
  const b = (typeof BOOKING !== "undefined") && BOOKING[p.id];
  if (!b) return "";
  const label = b.platform === "Tickets" ? "🎟️ Book tickets" : "📅 Reserve · " + b.platform;
  return `<a class="act act-book" href="${b.url}" target="_blank" rel="noopener">${label}</a>`;
}

function cardHTML(p) {
  const di = dayInfo(p);
  const showDay = state.day !== "any";
  const dayBadge = showDay
    ? `<div class="day-status ${di.open ? "open" : "closed"}">${di.open ? "● Open " + (state.day === "tue" ? "Tue" : "Wed") + " · " + di.text : "✕ " + di.text}</div>`
    : "";
  const srcBadge = p.source === "john"
    ? `<span class="badge john">🔔 John's pick</span>`
    : `<span class="badge alt">✨ Also recommended</span>`;
  const dist = (state.user && p._d != null) ? `<span class="dist">${fmtDist(p._d)}</span>` : "";

  const reviews = p.reviews.map(r =>
    `<div class="review"><span class="plat">${r.platform}</span><span class="rate">${r.rating}</span> — ${r.quote}</div>`
  ).join("");

  return `
  <article class="card" id="card-${p.id}" style="--cat:${catColor[p.category]}">
    <div class="card-top">
      <div>
        <h3>${p.name}</h3>
        <div class="cuisine">${catEmoji[p.category]} ${catLabel[p.category]} · ${p.cuisine.join(" · ")}</div>
      </div>
      ${dist}
    </div>

    <div class="badges">
      ${srcBadge}
      <span class="badge price">${priceStr(p)} · ${p.priceText}</span>
      <span class="badge res-${p.reservation}">${resLabel[p.reservation]}</span>
    </div>

    ${dayBadge}
    <p class="blurb">${p.blurb}</p>
    ${p.flag ? `<div class="flag">${p.flag}</div>` : ""}

    <div class="meta">
      <span><span class="ic">📍</span><a href="${mapsUrl(p)}" target="_blank" rel="noopener">${p.address}</a></span>
      ${p.phone ? `<span><span class="ic">📞</span><a href="tel:${p.phone.replace(/[^0-9+]/g, "")}">${p.phone}</a></span>` : ""}
      <span><span class="ic">🕒</span>${p.hours}</span>
      <span><span class="ic">🎟️</span>${p.resNote}</span>
    </div>

    <div class="why">“${p.why}”</div>
    <div class="reviews">${reviews}</div>

    <div class="card-actions">
      ${bookHTML(p)}
      <a class="act act-dir" href="${dirUrl(p)}" target="_blank" rel="noopener">${TRANSPORT[state.transport].emoji} Directions</a>
      <button class="act act-map" data-focus="${p.id}">🗺️ Show on map</button>
      ${p.website ? `<a class="act act-site" href="${p.website}" target="_blank" rel="noopener">🌐 Website</a>` : ""}
    </div>
  </article>`;
}

function renderCards() {
  const list = filtered();
  el("result-count").textContent =
    `${list.length} place${list.length === 1 ? "" : "s"}` +
    (state.user ? " · sorted by distance from you" : "");
  el("cards").innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<div class="empty">No places match these filters. Try “All” or clearing the search.</div>`;

  document.querySelectorAll("[data-focus]").forEach(btn =>
    btn.addEventListener("click", () => focusPlace(btn.dataset.focus)));

  renderMarkers(list);
}

/* ---------- Map ---------- */
function initMap() {
  map = L.map("map", { scrollWheelZoom: true }).setView([39.9510, -75.1605], 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  }).addTo(map);
}

function pin(color) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20],
  });
}

function renderMarkers(list) {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  const ids = new Set(list.map(p => p.id));
  const bounds = [];
  list.forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: pin(catColor[p.category]) }).addTo(map);
    m.bindPopup(
      `<div class="pop"><h4>${p.source === "john" ? "🔔 " : ""}${p.name}</h4>` +
      `<p>${catEmoji[p.category]} ${catLabel[p.category]} · ${priceStr(p)}${state.user && p._d != null ? " · " + fmtDist(p._d) : ""}</p>` +
      `<button onclick="document.getElementById('card-${p.id}').scrollIntoView({behavior:'smooth',block:'center'});window.__exitMap&&window.__exitMap()">View details ↓</button></div>`
    );
    markers[p.id] = m;
    bounds.push([p.lat, p.lng]);
  });
  if (state.user) bounds.push([state.user.lat, state.user.lng]);
  if (bounds.length) {
    try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); } catch (e) {}
  }
}

function focusPlace(id) {
  const p = PLACES.find(x => x.id === id);
  if (!p || !markers[id]) return;
  if (window.innerWidth <= 860) enterMap();
  map.setView([p.lat, p.lng], 16, { animate: true });
  markers[id].openPopup();
}

/* ---------- User location ---------- */
function setUser(lat, lng, label) {
  state.user = { lat, lng };
  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    zIndexOffset: 1000,
  }).addTo(map).bindPopup("<div class='pop'><h4>📍 You are here</h4></div>");
  const s = el("loc-status");
  s.hidden = false; s.classList.remove("err");
  s.textContent = "📍 Showing places near " + label + " — sorted by distance.";
  renderCards();
}

function locate() {
  if (!navigator.geolocation) return locErr("Geolocation isn't supported on this device — type an address instead.");
  const s = el("loc-status"); s.hidden = false; s.classList.remove("err"); s.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    pos => setUser(pos.coords.latitude, pos.coords.longitude, "your current location"),
    () => locErr("Couldn't get your location (permission denied?). Type your hotel/address instead."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
function locErr(msg) {
  const s = el("loc-status"); s.hidden = false; s.classList.add("err"); s.textContent = msg;
}

// Geocode a typed address via OpenStreetMap Nominatim (free, no key)
async function geocode(q) {
  const s = el("loc-status"); s.hidden = false; s.classList.remove("err"); s.textContent = "Looking up “" + q + "”…";
  try {
    const query = /phila|pa\b|pennsylvania/i.test(q) ? q : q + ", Philadelphia, PA";
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query));
    const data = await res.json();
    if (!data.length) return locErr("Couldn't find that address — try adding more detail.");
    setUser(parseFloat(data[0].lat), parseFloat(data[0].lon), q);
  } catch (e) {
    locErr("Address lookup failed (network?). Try the 📍 button instead.");
  }
}

/* ---------- Transport ---------- */
function renderTransportSeg() {
  el("transport-seg").innerHTML = Object.values(TRANSPORT).map(t =>
    `<button class="seg-btn ${t.key === state.transport ? "active" : ""}" data-transport="${t.key}">${t.emoji} ${t.label}</button>`
  ).join("");
  document.querySelectorAll("[data-transport]").forEach(b =>
    b.addEventListener("click", () => {
      state.transport = b.dataset.transport;
      document.querySelectorAll("[data-transport]").forEach(x => x.classList.toggle("active", x === b));
      renderTransportTips(); renderCards();
    }));
}
function renderTransportTips() {
  const t = TRANSPORT[state.transport];
  el("transport-tips").innerHTML =
    `<div class="tt-card"><h3>${t.emoji} ${t.label}</h3>` +
    `<p class="tt-summary">${t.summary}</p>` +
    `<ul>${t.tips.map(x => `<li>${x}</li>`).join("")}</ul></div>`;
}

/* ---------- Category chips ---------- */
function renderChips() {
  const counts = {};
  PLACES.forEach(p => {
    if (state.source !== "all" && p.source !== state.source) return;
    counts[p.category] = (counts[p.category] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let html = `<button class="chip ${state.category === "all" ? "active" : ""}" data-cat="all" style="${state.category === "all" ? "background:var(--navy)" : ""}">All <span class="count">${total}</span></button>`;
  CATEGORIES.forEach(c => {
    if (!counts[c.key]) return;
    const active = state.category === c.key;
    html += `<button class="chip ${active ? "active" : ""}" data-cat="${c.key}" style="${active ? "background:" + c.color : ""}">${c.emoji} ${c.label} <span class="count">${counts[c.key]}</span></button>`;
  });
  el("cat-chips").innerHTML = html;
  document.querySelectorAll("[data-cat]").forEach(b =>
    b.addEventListener("click", () => { state.category = b.dataset.cat; renderChips(); renderCards(); }));
}

/* ---------- Airport table ---------- */
function renderAirport() {
  el("airport-table").innerHTML =
    `<table><thead><tr><th>Option</th><th>Cost</th><th>Time</th><th>Notes</th></tr></thead><tbody>` +
    AIRPORT.map(a => `<tr><td><strong>${a.mode}</strong></td><td>${a.cost}</td><td>${a.time}</td><td>${a.note}</td></tr>`).join("") +
    `</tbody></table>`;
}

/* ---------- 2-day plan generator (rule-based, no LLM) ---------- */
const plan = {
  interests: CATEGORIES.map(c => c.key), // all on by default
  pace: "balanced",
  maxPrice: 4,
  walkInOnly: false,
};
const CENTER = { lat: 39.9526, lng: -75.1635 }; // City Hall — default route anchor

function daypartsFor(p) { return DAYPART_OVERRIDE[p.id] || DAYPART_BY_CAT[p.category] || []; }

// Weighted random among the top few candidates (lets "Regenerate" vary while staying good)
function pickWeighted(sorted) {
  const top = sorted.slice(0, Math.min(3, sorted.length));
  const weights = [3, 2, 1].slice(0, top.length);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) { if ((r -= weights[i]) < 0) return top[i].p; }
  return top[0].p;
}

function generateDay(dayKey, usedGlobal) {
  const slots = PACE_SLOTS[plan.pace];
  const pool = PLACES.filter(p =>
    p.tripStatus[dayKey].open &&                                  // hard: open that day
    p.priceLevel <= plan.maxPrice &&                             // hard: budget
    !(plan.walkInOnly && p.reservation === "required")          // hard: walk-in only
  );
  let anchor = state.user || CENTER;
  const usedDay = new Set();

  const blocks = slots.map(slot => {
    const cands = pool.filter(p =>
      !usedGlobal.has(p.id) && !usedDay.has(p.id) && daypartsFor(p).includes(slot.daypart));
    const matching = cands.filter(p => plan.interests.includes(p.category));
    const isMeal = MEAL_DAYPARTS.includes(slot.daypart);
    // meals always fill (you have to eat); optional slots honor interests strictly
    const useList = matching.length ? matching : (isMeal ? cands : []);
    if (!useList.length) return { slot, place: null };

    const a = anchor;
    const scored = useList.map(p => {
      let s = 0;
      if (p.source === "john") s += 3;                  // favor John's picks
      if (plan.interests.includes(p.category)) s += 4;  // favor chosen interests
      s -= distMiles(a, p) * 0.6;                        // shorter hops win → a route
      return { p, s };
    }).sort((x, y) => y.s - x.s);

    const place = pickWeighted(scored);
    usedDay.add(place.id); usedGlobal.add(place.id); anchor = place;
    return { slot, place };
  });

  const closed = PLACES.filter(p =>
    p.source === "john" && plan.interests.includes(p.category) && !p.tripStatus[dayKey].open);
  return { blocks, closed };
}

function renderPlanConfig() {
  const interestChips = CATEGORIES.map(c => {
    const on = plan.interests.includes(c.key);
    return `<button class="cfg-chip ${on ? "on" : ""}" data-int="${c.key}" style="${on ? "background:" + c.color + ";color:#fff;border-color:transparent" : ""}">${c.emoji} ${c.label}</button>`;
  }).join("");
  const seg = (arr, attr, cur) => arr.map(([v, l]) =>
    `<button class="seg-btn ${String(cur) === String(v) ? "active" : ""}" data-${attr}="${v}">${l}</button>`).join("");
  const loc = state.user ? "📍 Routed from your location" : "Routed from Center City — set your location above for a tighter route";
  return `<div class="cfg">
    <div class="cfg-row"><span class="control-label">Interests</span><div class="cfg-chips">${interestChips}</div></div>
    <div class="cfg-row"><span class="control-label">Pace</span><div class="segmented">${seg([["relaxed", "🌿 Relaxed"], ["balanced", "⚖️ Balanced"], ["packed", "⚡ Packed"]], "pace", plan.pace)}</div></div>
    <div class="cfg-row"><span class="control-label">Max budget</span><div class="segmented">${seg([[1, "$"], [2, "$$"], [3, "$$$"], [4, "$$$$"]], "budget", plan.maxPrice)}</div></div>
    <div class="cfg-row"><span class="control-label">Bookings</span><div class="segmented">${seg([[false, "📅 I'll book ahead"], [true, "✅ Walk-ins only"]], "walk", plan.walkInOnly)}</div></div>
    <div class="cfg-row cfg-actions"><button id="regen" class="hero-btn primary">🎲 Regenerate</button><span class="cfg-loc">${loc}</span></div>
  </div>`;
}

function renderPlan() {
  el("plan-config").innerHTML = renderPlanConfig();
  document.querySelectorAll("[data-int]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.int, i = plan.interests.indexOf(k);
    if (i >= 0) plan.interests.splice(i, 1); else plan.interests.push(k);
    renderPlan();
  }));
  document.querySelectorAll("[data-pace]").forEach(b => b.addEventListener("click", () => { plan.pace = b.dataset.pace; renderPlan(); }));
  document.querySelectorAll("[data-budget]").forEach(b => b.addEventListener("click", () => { plan.maxPrice = +b.dataset.budget; renderPlan(); }));
  document.querySelectorAll("[data-walk]").forEach(b => b.addEventListener("click", () => { plan.walkInOnly = b.dataset.walk === "true"; renderPlan(); }));
  el("regen") && el("regen").addEventListener("click", renderPlanDays);
  renderPlanDays();
}

function renderPlanDays() {
  const usedGlobal = new Set();
  el("itin-days").innerHTML = TRIP_DAYS.map(d => {
    const { blocks, closed } = generateDay(d.key, usedGlobal);
    const rows = blocks.map(b => {
      if (!b.place) {
        return `<div class="itin-block"><div class="itin-time">${b.slot.time}</div><div><h4>${b.slot.label}</h4><p class="bdesc free">Free time — wander &amp; explore ✨</p></div></div>`;
      }
      const p = b.place;
      const resTxt = p.reservation === "walkin" ? "walk-in" : p.reservation === "ticket" ? "ticket" : "reserve";
      const dTxt = state.user ? " · " + fmtDist(distMiles(state.user, p)) : "";
      return `<div class="itin-block"><div class="itin-time">${b.slot.time}</div><div>
        <h4>${b.slot.label}</h4>
        <button class="itin-chip" data-goto="${p.id}"><span class="ichip-dot" style="background:${catColor[p.category]}"></span>${p.source === "john" ? "🔔 " : ""}${p.name}</button>
        <p class="bdesc">${catEmoji[p.category]} ${catLabel[p.category]} · ${priceStr(p)} · ${resTxt}${dTxt}</p>
      </div></div>`;
    }).join("");
    const closedNote = closed.length
      ? `<p class="itin-closed">⚠️ Closed ${d.label.split("·")[0].trim()} (skipped): ${closed.map(c => c.name).join(", ")}</p>` : "";
    return `<div class="itin-day">
      <div class="itin-day-head"><span class="pill">${d.label}</span><h3>${d.full}</h3>${closedNote}</div>
      <div class="itin-blocks">${rows}</div>
    </div>`;
  }).join("");

  document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => {
    closeItinerary();
    const id = btn.dataset.goto;
    setTimeout(() => {
      const card = document.getElementById("card-" + id);
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight"); setTimeout(() => card.classList.remove("highlight"), 1800); }
    }, 60);
  }));
}

function openItinerary() {
  renderPlan();
  el("itinerary").hidden = false;
  document.querySelector(".layout").style.display = "none";
  el("transport-tips").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function closeItinerary() {
  el("itinerary").hidden = true;
  document.querySelector(".layout").style.display = "";
  el("transport-tips").style.display = "";
}

/* ---------- Share ---------- */
async function share() {
  const url = location.href.split("#")[0];
  const data = { title: "Philly Guide — your 2-day visit", text: "A hand-built guide to eating & exploring Philadelphia 🔔", url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    flashShare("🔗 Link copied!");
  } catch (e) { flashShare(url); }
}
function flashShare(msg) {
  const btn = el("share-btn"); const orig = btn.textContent;
  btn.textContent = msg; setTimeout(() => btn.textContent = orig, 1800);
}

/* ---------- Mobile map view ---------- */
function enterMap() {
  el("map-pane").classList.add("show");
  document.body.classList.add("map-mode");
  el("view-map").classList.add("active"); el("view-list").classList.remove("active");
  setTimeout(() => map.invalidateSize(), 60);
}
function exitMap() {
  el("map-pane").classList.remove("show");
  document.body.classList.remove("map-mode");
  el("view-list").classList.add("active"); el("view-map").classList.remove("active");
}
window.__exitMap = () => { if (window.innerWidth <= 860) exitMap(); };

/* ---------- Wire up ---------- */
function init() {
  // banner
  if (typeof BANNER !== "undefined") {
    el("banner-title").textContent = BANNER.title;
    el("banner-body").textContent = BANNER.body;
    el("banner").hidden = false;
    el("banner-close").addEventListener("click", () => el("banner").hidden = true);
  }

  initMap();
  renderTransportSeg();
  renderTransportTips();
  renderChips();
  renderAirport();
  renderCards();

  // source filter
  document.querySelectorAll("[data-source]").forEach(b =>
    b.addEventListener("click", () => {
      state.source = b.dataset.source;
      document.querySelectorAll("[data-source]").forEach(x => x.classList.toggle("active", x === b));
      renderChips(); renderCards();
    }));

  // day filter
  document.querySelectorAll("[data-day]").forEach(b =>
    b.addEventListener("click", () => {
      state.day = b.dataset.day;
      document.querySelectorAll("[data-day]").forEach(x => x.classList.toggle("active", x === b));
      renderCards();
    }));

  el("open-only").addEventListener("change", e => { state.openOnly = e.target.checked; renderCards(); });

  // search (debounced-ish)
  let t;
  el("search").addEventListener("input", e => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value.trim(); renderCards(); }, 120);
  });

  // location
  el("locate-btn").addEventListener("click", locate);
  el("addr-go").addEventListener("click", () => { const v = el("addr-input").value.trim(); if (v) geocode(v); });
  el("addr-input").addEventListener("keydown", e => { if (e.key === "Enter") { const v = e.target.value.trim(); if (v) geocode(v); } });

  // view toggle (mobile)
  el("view-map").addEventListener("click", enterMap);
  el("view-list").addEventListener("click", exitMap);

  // itinerary + share
  el("plan-btn").addEventListener("click", openItinerary);
  el("itin-close").addEventListener("click", closeItinerary);
  el("share-btn").addEventListener("click", share);

  // map close button (mobile)
  const closeBtn = document.createElement("button");
  closeBtn.className = "map-close"; closeBtn.textContent = "✕"; closeBtn.setAttribute("aria-label", "Close map");
  closeBtn.addEventListener("click", exitMap);
  el("map-pane").appendChild(closeBtn);
}

document.addEventListener("DOMContentLoaded", init);
