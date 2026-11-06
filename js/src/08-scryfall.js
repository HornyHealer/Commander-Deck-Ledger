// js/src/08-scryfall.js: Scryfall: card images and lookups.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- Scryfall: card images and lookups for cards missing from the built-in list ----------
const SCRY = "https://api.scryfall.com/cards/named?exact=";
const front = n => String(n).split(" // ")[0];
const imgUrl = (n, v) => SCRY + encodeURIComponent(front(n)) + "&format=image&version=" + (v || "normal");
let EXTRA = {}; try { EXTRA = JSON.parse(localStorage.getItem("cdl-cards-extra") || "{}") || {}; } catch {}
function addRec(r, alias) {
  let i = IDX.get(norm(r[0]));
  if (i === undefined) { i = CARDS.push(r) - 1; const k = norm(r[0]); IDX.set(k, i); NAMES.push(k); if (r[0].includes(" // ")) { const f = norm(front(r[0])); if (!IDX.has(f)) IDX.set(f, i); } if (r[5] && !OID.has(r[5])) OID.set(r[5], i); }
  if (alias && !IDX.has(alias)) IDX.set(alias, i);
}
function loadExtraCards() { for (const [alias, r] of Object.entries(EXTRA)) if (Array.isArray(r) && r.length >= 5) addRec(r, alias); }
function scryCost(s) { return (s || "").split(" // ").map(f => (f.match(/\{([^}]+)\}/g) || []).map(x => x.slice(1, -1)).join(" ")).join(" // "); }
function scryRec(c) {
  if (!c || !c.name) return null;
  const faces = c.card_faces || [];
  const cost = c.layout === "split" && faces.length ? faces.map(f => f.mana_cost || "").join(" // ") : (faces.length && faces[0].mana_cost !== undefined ? faces[0].mana_cost : c.mana_cost);
  const typeLine = c.type_line || (faces[0] && faces[0].type_line) || "";
  const frontType = faces.length && faces[0].type_line ? faces[0].type_line : front(typeLine);
  const words = frontType.split(/[\s—-]+/);
  let tc = "O";
  for (const [w, code] of [["Creature", "C"], ["Planeswalker", "P"], ["Battle", "B"], ["Land", "L"], ["Instant", "I"], ["Sorcery", "S"], ["Artifact", "A"], ["Enchantment", "E"]]) if (words.includes(w)) { tc = code; break; }
  const ci = MANA_ORDER.split("").filter(x => (c.color_identity || []).includes(x)).join("");
  const text = [c.oracle_text, ...faces.map(f => f.oracle_text)].filter(Boolean).join("\n");
  const legal = (c.legalities || {}).commander;
  let flags = 0;
  if ((words.includes("Legendary") && words.includes("Creature")) || /can be your commander/i.test(text)) flags |= F.COMMANDER;
  if (legal === "banned") flags |= F.BANNED;
  if (legal === "not_legal") flags |= F.NOT_LEGAL;
  if (c.game_changer === true) flags |= F.GAME_CHANGER;
  flags |= RULES.textFlags(text, tc);
  const r = [c.name, scryCost(cost), tc, ci, flags, c.oracle_id || "", RULES.pairCode(text, frontType)];
  const limit = RULES.copyLimit(text); if (limit) r.push(limit);
  return r;
}
const looked = new Set(); let lookTimer = null, looking = false;
function queueLookups() { clearTimeout(lookTimer); lookTimer = setTimeout(runLookups, 500); }
async function runLookups() {
  if (looking) return queueLookups();
  const names = new Set();
  for (const d of S.decks.values()) { d.cur.forEach(c => names.add(c.n)); d.printed.forEach(p => names.add(p.n)); (d.bench && d.bench.in || []).forEach(x => names.add(x.n)); }
  (S.loose.cards || []).forEach(c => names.add(c.n));
  const todo = [...names].filter(n => !rec(n) && !looked.has(norm(n))).slice(0, 30);
  if (!todo.length) return;
  looking = true; let added = 0;
  for (const n of todo) {
    looked.add(norm(n));
    try {
      const res = await fetch(SCRY + encodeURIComponent(front(n)), { headers: { Accept: "application/json" } });
      if (res.ok) { const r = scryRec(await res.json()); if (r) { addRec(r, norm(n)); EXTRA[norm(n)] = r; added++; } }
    } catch {}
    await new Promise(ok => setTimeout(ok, 120));
  }
  looking = false;
  if (added) {
    try { localStorage.setItem("cdl-cards-extra", JSON.stringify(EXTRA)); } catch {}
    let changed = syncBinIds(); for (const d of S.decks.values()) if (syncDeckIds(d)) changed = true;
    if (changed) persist();
    safeRender();
  }
}

// hover previews (mouse) and tap previews (touch)
const canHover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
const PREVIEW_SEL = ".row .nm > span:first-child, .brow .nm, .swap .o, .swap .i, .plines span, .sugg button:not(.free-row) .nm";
function cardNameFrom(el) {
  let s = "";
  for (const node of el.childNodes) { if (node.nodeType === 3) s += node.textContent; else break; }
  s = (s || el.textContent || "").trim().replace(/^\d+x\s+/, "").replace(/\s+×\d+$/, "").trim();
  return s;
}
let pv = null, pvTimer = null, pvFor = null;
function pvEl() {
  if (!pv) { pv = document.createElement("div"); pv.className = "cardpv"; pv.hidden = true; pv.innerHTML = '<img alt=""><a class="pv-link" target="_blank" rel="noopener" hidden>Open on Scryfall ↗</a>'; document.body.appendChild(pv); pv.querySelector("img").addEventListener("error", () => { pv.hidden = true; }); }
  return pv;
}
function placePv(x, y) {
  const p = pvEl(); const w = 250, h = 349, pad = 16;
  let left = x + 22, top = y - 60;
  if (left + w + pad > innerWidth) left = x - w - 22;
  if (top + h + pad > innerHeight) top = innerHeight - h - pad;
  if (top < pad) top = pad;
  p.style.left = Math.max(pad, left) + "px"; p.style.top = top + "px";
}
function showPv(name, x, y) {
  const p = pvEl(); const img = p.querySelector("img");
  const url = imgUrl(name); if (img.getAttribute("src") !== url) img.src = url;
  img.alt = name; placePv(x, y); p.hidden = false;
}
if (canHover) {
  document.addEventListener("mouseover", e => {
    const el = e.target.closest && e.target.closest(PREVIEW_SEL); if (!el || el === pvFor) return;
    pvFor = el; clearTimeout(pvTimer);
    const n = cardNameFrom(el); if (!n) return;
    const x = e.clientX, y = e.clientY;
    pvTimer = setTimeout(() => { if (pvFor === el) showPv(n, x, y); }, 140);
  });
  document.addEventListener("mousemove", e => { if (pv && !pv.hidden) placePv(e.clientX, e.clientY); });
  document.addEventListener("mouseout", e => {
    if (!pvFor) return; const to = e.relatedTarget;
    if (to && pvFor.contains(to)) return;
    pvFor = null; clearTimeout(pvTimer); if (pv) pv.hidden = true;
  });
  document.addEventListener("scroll", () => { if (pv) pv.hidden = true; pvFor = null; }, true);
} else {
  document.addEventListener("click", e => {
    if (pv && !pv.hidden) { if (e.target.closest(".pv-link")) { setTimeout(() => { pv.hidden = true; pv.classList.remove("tap"); }, 0); return; } e.preventDefault(); pv.hidden = true; pv.classList.remove("tap"); return; }
    const el = e.target.closest && e.target.closest(".row .nm > span:first-child"); if (!el) return;
    const n = cardNameFrom(el); if (!n) return;
    e.preventDefault(); // show the picture first; its link opens Scryfall
    const p = pvEl(); p.classList.add("tap"); const img = p.querySelector("img"); img.src = imgUrl(n); img.alt = n; p.style.left = ""; p.style.top = "";
    const a = p.querySelector(".pv-link"); a.href = scry(n); a.hidden = false; p.hidden = false;
  });
}

function safeRender() {
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && $("#app").contains(a)) { pendingRender = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (pendingRender) setTimeout(() => { const a = document.activeElement; if (!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) { pendingRender = false; render(); } }, 0); });
