// js/src/10-glitch.js: glitch transitions, the loading screen's exit and card-image glitches.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- glitch transitions (Marathon-style) ----------
// Views, popups and card images arrive as fragments: blocks that drop out in random order (like the Marathon
// loading moth), red and cyan copies cut into horizontal slices that slide together and lock onto the real
// thing, and a few colored scan lines. Copies are look-only (inert, no ids) and removed afterwards.
// Skipped entirely when the device asks for reduced motion.
let lastViewKey = null, lastDialogKey = null, glitchTarget = null;
// The next render glitches just this part of the page (a deck tab's contents, a section that folded open or shut).
function glitchNext(sel) { glitchTarget = sel; }
const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const GLITCH_MS = 400, GLITCH_POP_MS = 340, GLITCH_IMG_MS = 300;
const vfxRnd = (a, b) => a + Math.random() * (b - a);
const VFX_STEP = { easing: "steps(1, end)" };
function vfxFilters() {
  if (document.getElementById("vfx-defs")) return;
  const NS = "http://www.w3.org/2000/svg"; const svg = document.createElementNS(NS, "svg");
  svg.id = "vfx-defs"; svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  // Keep only the red channel, or only green and blue (cyan).
  svg.innerHTML = '<filter id="vfx-r" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter>'
    + '<filter id="vfx-c" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>'
    // light mode: purple (red and blue) and teal (green, some blue)
    + '<filter id="vfx-p" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".7 0 0 0 0  0 .45 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>'
    + '<filter id="vfx-t" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 .75 0 0  0 0 0 1 0"/></filter>';
  document.body.appendChild(svg);
}
// A clip-path made of several horizontal bands (percent of the height).
function bandsClip(n, cover) {
  const cuts = new Set(); while (cuts.size < n * 2) cuts.add(Math.round(Math.random() * 1000) / 10);
  const ys = [...cuts].sort((a, b) => a - b); const pts = [];
  for (let k = 0; k < ys.length; k += 2) {
    let y1 = ys[k], y2 = ys[k + 1]; if (Math.random() > cover) y2 = y1 + (y2 - y1) * .3;
    pts.push(`0 ${y1}%`, `100% ${y1}%`, `100% ${y2}%`, `0 ${y2}%`);
  }
  return `polygon(${pts.join(",")})`;
}
// Steps for a sliced copy: shifted up to `reach` px (mostly in `dir`), closing in, then gone.
function ghostFrames(dir, reach) {
  const n = 10, frames = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, amp = Math.pow(1 - t, 1.4) * vfxRnd(reach * .35, reach);
    frames.push({ offset: t * .82, opacity: 1, transform: `translateX(${(dir * amp * (Math.random() < .25 ? -1 : 1)).toFixed(1)}px)`, clipPath: bandsClip(Math.round(vfxRnd(4, 9)), .4 + t * .5), ...VFX_STEP });
  }
  frames.push({ offset: 1, opacity: 0, transform: "translateX(0)", clipPath: "inset(0)" });
  return frames;
}
// Steps for the real thing: hidden, then torn bands that jitter sideways, then whole.
function realFrames(shift, jitter, split) {
  const f = [{ offset: 0, opacity: 0, ...VFX_STEP }];
  for (let i = 1; i <= 7; i++) {
    const t = i / 8, x = (vfxRnd(-1, 1) * jitter * (1 - t)).toFixed(1);
    const k = { offset: .15 + t * .7, opacity: 1, clipPath: bandsClip(Math.round(vfxRnd(3, 6)), .5 + t * .5), ...VFX_STEP };
    if (shift === "left") k.left = x + "px"; else k.transform = `translateX(${x}px)`;
    if (split) k.textShadow = `${(3 * (1 - t) + 1).toFixed(1)}px 0 var(--split-a), ${(-3 * (1 - t) - 1).toFixed(1)}px 0 var(--split-b)`;
    f.push(k);
  }
  const end = { offset: 1, opacity: 1, clipPath: "inset(0 0 0 0)" };
  if (shift === "left") end.left = "0px"; else end.transform = "translateX(0)";
  if (split) end.textShadow = "none";
  f.push(end);
  return f;
}
// Blocks that drop out in random order (some hatched in the palette), plus scan lines.
function blocksHtml(cols, rows, dur, lines) {
  const hues = ["a", "c", "h", "a", "c"]; let h = "";
  for (let k = 0; k < cols * rows; k++) {
    const roll = Math.random(); if (roll < .2) { h += "<i></i>"; continue; } // already open
    const cls = roll > .82 ? " " + hues[Math.floor(Math.random() * hues.length)] : "";
    h += `<i class="b${cls}" style="animation-delay:${Math.round(Math.random() * Math.random() * dur * .55)}ms"></i>`;
  }
  for (let k = 0; k < lines; k++) h += `<b class="ln ${["a", "c", "h", "w"][k % 4]}" style="top:${vfxRnd(0, 100).toFixed(1)}%;height:${Math.ceil(vfxRnd(1, 3))}px;animation-delay:${Math.round(vfxRnd(0, dur * .6))}ms"></b>`;
  return h;
}
// Plays the glitch over a whole view (mode "view") or a popup (mode "pop").
function playGlitch(target, mode = "view") {
  const pop = mode === "pop", tag = pop ? "p" : "v", dur = pop ? GLITCH_POP_MS : GLITCH_MS;
  document.querySelectorAll(`.vfx.${tag}, .vfx-ghosts.${tag}`).forEach(el => el.remove());
  if (!target || !target.isConnected) return;
  vfxFilters();
  const r = target.getBoundingClientRect();
  const top = Math.max(0, r.top), bottom = pop ? Math.min(innerHeight, r.bottom) : innerHeight;
  const vh = Math.max(0, bottom - top); if (!vh) return;
  const parts = [];
  // 1. The real thing.
  target.animate(realFrames(pop ? "transform" : "left", pop ? 18 : 30, true), { duration: dur });
  // 2. Blocks over its area, with scan lines (and the sweeping bar for whole views).
  const fx = document.createElement("div"); fx.className = "vfx " + tag; fx.setAttribute("aria-hidden", "true");
  const cols = Math.max(pop ? 6 : 8, Math.round((pop ? r.width : innerWidth) / (pop ? 52 : 64))), rows = Math.max(5, Math.round(vh / 36));
  Object.assign(fx.style, { top: top + "px", height: vh + "px", left: pop ? r.left + "px" : "0px", width: pop ? r.width + "px" : "100%",
    gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` });
  fx.innerHTML = blocksHtml(cols, rows, dur, pop ? 6 : 9) + (pop ? "" : '<b class="vfx-bar"></b>');
  document.body.appendChild(fx); parts.push(fx);
  // 3. Sliced red and cyan copies closing in. Built one frame later, once the blocks are on screen, so copying
  // never delays the first response to a tap.
  const gw = document.createElement("div"); gw.className = "vfx-ghosts " + tag; gw.setAttribute("aria-hidden", "true"); gw.inert = true; parts.push(gw);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // The page may have been redrawn since (say, card details arriving): copy what's there now.
    if (!target.isConnected) target = pop ? $(".scrim .dialog") : $(".view");
    if (!target) return;
    Object.assign(gw.style, { top: r.top + "px", left: r.left + "px", width: r.width + "px", height: (bottom - r.top) + "px" });
    [["r", 1], ["c", -1]].forEach(([c, dir], k) => {
      const g = target.cloneNode(true); g.classList.add("vfx-ghost", "g-" + c);
      // Only what's on screen matters: drop the long lists' off-screen rows so the copies stay cheap.
      for (const sel of [".row", ".entry", ".deckbox", ".swap", ".cb-card"]) [...g.querySelectorAll(sel)].slice(sel === ".deckbox" ? 12 : 24).forEach(e => e.remove());
      g.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
      g.animate(ghostFrames(dir, pop ? 70 : 110), { duration: dur * vfxRnd(.8, .92), delay: k * 12, fill: "both" });
      gw.appendChild(g);
    });
    document.body.appendChild(gw);
  }));
  setTimeout(() => parts.forEach(el => el.remove()), dur + 120);
}
// The loading screen ("Defragmenting") stays up until the decks are in, for at least a moment so it never just
// flashes, then breaks into dark blocks that drop out while the page glitches in underneath.
// With reduced motion it simply goes as soon as everything is ready.
const BOOT_MIN_MS = 900;
let bootDone = false;
function revealBoot() {
  if (bootDone) return; bootDone = true;
  const boot = document.getElementById("boot"); if (!boot) return;
  if (reduceMotion()) { boot.remove(); return; }
  const wait = Math.max(0, BOOT_MIN_MS - performance.now());
  setTimeout(() => {
    boot.classList.add("boot-out"); // a hard glitch on the text first
    setTimeout(() => {
      const cols = Math.max(8, Math.round(innerWidth / 56)), rows = Math.max(8, Math.round(innerHeight / 40));
      boot.innerHTML = `<div class="boot-tiles" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${blocksHtml(cols, rows, 420, 10)}</div>`;
      boot.classList.add("boot-gone");
      playGlitch($(".view"));
      setTimeout(() => boot.remove(), 480);
    }, 160);
  }, wait);
}
// A smaller version for a card image as it finishes loading.
function glitchImage(img) {
  if (reduceMotion() || !img.isConnected || !img.offsetWidth || !img.offsetHeight) return;
  vfxFilters();
  const host = img.offsetParent; if (!host) return;
  host.querySelectorAll(".vfx-img").forEach(el => { if (el._for === img) el.remove(); });
  const box = document.createElement("span"); box.className = "vfx-img"; box.setAttribute("aria-hidden", "true"); box._for = img;
  Object.assign(box.style, { left: img.offsetLeft + "px", top: img.offsetTop + "px", width: img.offsetWidth + "px", height: img.offsetHeight + "px" });
  const cols = Math.max(4, Math.round(img.offsetWidth / 30)), rows = Math.max(5, Math.round(img.offsetHeight / 24));
  let h = `<span class="vfx-blocks" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${blocksHtml(cols, rows, GLITCH_IMG_MS, 4)}</span>`;
  box.innerHTML = h;
  for (const [c, dir] of [["r", 1], ["c", -1]]) {
    const g = document.createElement("img"); g.src = img.currentSrc || img.src; g.alt = ""; g.className = "vfx-ghost g-" + c;
    g.animate(ghostFrames(dir, Math.min(40, img.offsetWidth * .2)), { duration: GLITCH_IMG_MS * vfxRnd(.8, .92), fill: "both" });
    box.appendChild(g);
  }
  host.appendChild(box);
  img.animate(realFrames("transform", 10, false), { duration: GLITCH_IMG_MS });
  setTimeout(() => box.remove(), GLITCH_IMG_MS + 100);
}
// Fold-out sections (<details>, like "How it works" on a combo or "Counts by type") glitch as they open or close.
document.addEventListener("click", e => {
  const sm = e.target.closest && e.target.closest("summary"); if (!sm || reduceMotion()) return;
  const det = sm.parentElement; requestAnimationFrame(() => { if (det && det.isConnected) playGlitch(det, "pop"); });
});
// Card images glitch in when they load: the hover preview, Combos' card pictures and the artwork choices.
const GLITCH_IMG_SEL = ".cardpv img, .cb-img, .print img, .artprev, .hand-card img";
document.addEventListener("load", e => { const t = e.target; if (t && t.tagName === "IMG" && t.matches(GLITCH_IMG_SEL) && !t.closest(".vfx-ghosts, .vfx-img")) glitchImage(t); }, true);
