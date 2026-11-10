// js/src/10-starlight.js: the Starlight theme's transformation, used instead of the glitch (see 10-glitch.js).
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- Starlight transformations ----------
// Each box that's changing (a panel, a popup, a tab's contents, a card picture) fills with a green nebula in the
// shape of the box and nothing outside it, radiating out from its center while strands of starlight sweep across
// and wrap it. A glint runs over it, then it opens from the center in a ring of mint light and the real box is
// there. Text outside the boxes simply fades in.
// Everything but the sparkles is a Web Animation of opacity, transform or clip-path, so it runs on the graphics
// chip; the sparkles are pre-drawn images stamped on one canvas that only runs while something is happening.
// Skipped entirely when the device asks for reduced motion (playGlitch checks before calling here).
const SL = { canvas: null, ctx: null, W: 0, H: 0, parts: [], ribbons: [], clips: new Set(), raf: 0, last: 0, view: null, nebula: null, painting: null };
const slR = (a, b) => a + Math.random() * (b - a);
const SL_COLORS = ["#ffffff", "#ffffff", "#c9ffe9", "#8ff2c9", "#f3dca0", "#bfe0ff"];
const SL_RIBBON = ["#c9ffe9", "#8ff2c9", "#ffffff", "#f3dca0", "#5fe0b0"];

// ---- sparkles ----
// A flare: a soft glow, a bright core and four long hairline spikes, like starlight through a lens.
// A bokeh: a soft out-of-focus disc. Each is drawn once per colour and stamped after that.
const slSprites = {};
function slSprite(kind, c) {
  const key = kind + c; if (slSprites[key]) return slSprites[key];
  const S = 64, m = S / 2, cv = document.createElement("canvas"); cv.width = cv.height = S; const g = cv.getContext("2d");
  if (kind === "bokeh") {
    const rg = g.createRadialGradient(m, m, 0, m, m, m * .5); rg.addColorStop(0, c); rg.addColorStop(.7, c + "88"); rg.addColorStop(1, c + "00");
    g.globalAlpha = .55; g.fillStyle = rg; g.beginPath(); g.arc(m, m, m * .5, 0, 6.28); g.fill();
  } else {
    const glow = g.createRadialGradient(m, m, 0, m, m, m * .45); glow.addColorStop(0, c + "cc"); glow.addColorStop(1, c + "00");
    g.fillStyle = glow; g.fillRect(0, 0, S, S); g.globalCompositeOperation = "lighter";
    for (const [len, wid, ang] of [[m, 1.3, 0], [m, 1.3, Math.PI / 2], [m * .45, .8, Math.PI / 4], [m * .45, .8, -Math.PI / 4]]) {
      g.save(); g.translate(m, m); g.rotate(ang);
      const lg = g.createLinearGradient(-len, 0, len, 0); lg.addColorStop(0, c + "00"); lg.addColorStop(.5, "#ffffff"); lg.addColorStop(1, c + "00");
      g.fillStyle = lg; g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.closePath(); g.fill(); g.restore();
    }
    const core = g.createRadialGradient(m, m, 0, m, m, 4); core.addColorStop(0, "#ffffff"); core.addColorStop(1, "#ffffff00");
    g.fillStyle = core; g.beginPath(); g.arc(m, m, 4, 0, 6.28); g.fill();
  }
  return slSprites[key] = cv;
}
function slCanvas() {
  if (!SL.canvas) {
    SL.canvas = document.createElement("canvas"); SL.canvas.className = "sl-fx"; SL.canvas.setAttribute("aria-hidden", "true");
    SL.ctx = SL.canvas.getContext("2d");
    addEventListener("resize", () => { SL.W = 0; });
  }
  if (!SL.canvas.isConnected) document.body.appendChild(SL.canvas);
  if (SL.W !== innerWidth || SL.H !== innerHeight) {
    const dpr = Math.min(2, devicePixelRatio || 1); SL.W = innerWidth; SL.H = innerHeight;
    SL.canvas.width = SL.W * dpr; SL.canvas.height = SL.H * dpr; SL.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (!SL.raf) { SL.last = performance.now(); SL.raf = requestAnimationFrame(slTick); }
}
function slSpark(x, y, o = {}) {
  if (SL.parts.length > 450) return;
  SL.parts.push({ x, y, vx: o.vx ?? slR(-.4, .4), vy: o.vy ?? slR(-.6, .2), life: 0, max: o.max ?? slR(500, 1100), size: o.size ?? slR(3, 9),
    c: o.c ?? SL_COLORS[Math.random() * SL_COLORS.length | 0], wait: o.delay || 0, rot: Math.random() < .5 ? 0 : slR(-.3, .3), spin: slR(-.0008, .0008),
    kind: o.kind ?? (Math.random() < .7 ? "star" : "bokeh"), tx: o.tx, ty: o.ty, g: o.g ?? .0006 });
}
// A strand of light: a soft glow with a fine bright line through it, fading along its trail, flares glinting on it.
function slRibbons(now) {
  const g = SL.ctx;
  SL.ribbons = SL.ribbons.filter(rb => now < rb.at + rb.dur * (1 + rb.trail) + 50);
  for (const rb of SL.ribbons) {
    const u = (now - rb.at) / rb.dur; if (u < 0) continue;
    const pts = [];
    for (let k = 0; k <= 40; k++) { const s = u - rb.trail * k / 40; if (s >= 0 && s <= 1) pts.push([rb.at2(s), 1 - k / 40]); }
    if (pts.length > 1) {
      const [hx, hy] = pts[0][0], [tx, ty] = pts[pts.length - 1][0];
      const fade = (col, a) => { const lg = g.createLinearGradient(hx, hy, tx, ty); lg.addColorStop(0, col + a); lg.addColorStop(1, col + "00"); return lg; };
      g.beginPath(); pts.forEach(([[x, y]], k) => k ? g.lineTo(x, y) : g.moveTo(x, y));
      g.lineJoin = "round"; g.lineCap = "butt"; g.globalAlpha = 1;
      g.strokeStyle = fade(rb.c, "26"); g.lineWidth = rb.width * 2.6; g.stroke();
      g.strokeStyle = fade(rb.c, "55"); g.lineWidth = rb.width * .9; g.stroke();
      g.strokeStyle = fade("#ffffff", "cc"); g.lineWidth = 1.1; g.stroke();
    }
    const fl = slSprite("star", rb.c);
    for (let k = 0; k < pts.length; k += 7) { const [[x, y], f] = pts[k]; const q = (k ? 10 : 22) * (.5 + f * .5); g.globalAlpha = k ? .7 * f : 1; g.drawImage(fl, x - q / 2, y - q / 2, q, q); }
    if (u <= 1 && Math.random() < .6) { const [x, y] = rb.at2(u); slSpark(x + slR(-8, 8), y + slR(-8, 8), { vx: slR(-.12, .12), vy: slR(-.12, .12), g: 0, max: slR(500, 1000), size: slR(1.5, 4), c: rb.c }); }
  }
  g.globalAlpha = 1;
}
function slTick(now) {
  const g = SL.ctx, dt = Math.min(50, now - SL.last); SL.last = now;
  g.clearRect(0, 0, SL.W, SL.H);
  if (!SL.parts.length && !SL.ribbons.length) { SL.raf = 0; return; } // nothing happening: stop until the next one
  g.save(); g.globalCompositeOperation = "lighter";
  // while boxes are transforming, their sparkles stay inside them
  if (SL.clips.size) { g.beginPath(); for (const list of SL.clips) for (const b of list) g.roundRect(b.x, b.y, b.w, b.h, b.rad); g.clip(); }
  if (SL.ribbons.length) slRibbons(now);
  SL.parts = SL.parts.filter(p => { if (p.wait > 0) { p.wait -= dt; return true; } return (p.life += dt) < p.max; });
  for (const p of SL.parts) {
    if (p.wait > 0) continue;
    if (p.tx != null) { p.x += (p.tx - p.x) * .09; p.y += (p.ty - p.y) * .09; } else { p.x += p.vx * dt * .06; p.y += p.vy * dt * .06; p.vy += p.g * dt; }
    p.rot += p.spin * dt;
    const k = p.life / p.max, a = k < .2 ? k / .2 : 1 - (k - .2) / .8, tw = .7 + .3 * Math.sin(p.life / 40);
    const img = slSprite(p.kind, p.c), s = p.size * (1 - k * .35) * (p.kind === "star" ? 4.2 : 2.2);
    g.globalAlpha = Math.max(0, a * tw);
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(img, -s / 2, -s / 2, s, s); g.restore();
  }
  g.restore();
  SL.raf = requestAnimationFrame(slTick);
}

// ---- the nebula ----
// Painted once into an image, like the Milky Way in the sky behind but in greens from deep forest to Soraka's
// mint: a dark green base (never black), broad fields of colour, flowing bands of cloud with darker dust lanes
// beside them, wispy threads, a bright heart with faint rays, and stars. Painted when the page is idle; until
// then (and if anything goes wrong) a plain green gradient stands in.
function slPaint(now) {
  if (SL.painting) return SL.painting;
  return SL.painting = new Promise(done => {
    const go = () => {
      try {
        const S = 720, m = S / 2, cv = document.createElement("canvas"); cv.width = cv.height = S; const g = cv.getContext("2d");
        const blob = (x, y, r, col, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
        const FOREST = "14,74,52", PINE = "18,104,72", EMERALD = "30,160,110", JADE = "40,190,140", SEAFOAM = "80,215,170", MINT = "143,242,201";
        const bg = g.createRadialGradient(m, m, 0, m, m, m * 1.25); bg.addColorStop(0, "#0e4a37"); bg.addColorStop(.55, "#09311f"); bg.addColorStop(1, "#05211a");
        g.fillStyle = bg; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 28; i++) blob(slR(0, S), slR(0, S), slR(180, 340), [FOREST, PINE, EMERALD, "10,90,80"][i % 4], slR(.12, .22));
        const bands = Array.from({ length: 4 }, () => ({ y0: slR(.15, .85) * S, slope: slR(-.5, .5), amp: slR(30, 105), ph: slR(0, 6.28), wid: slR(40, 96) }));
        const onBand = (bd, t, off) => { const x = t * (S + 160) - 80; return [x, bd.y0 + (x - m) * bd.slope + Math.sin(bd.ph + t * 5) * bd.amp + off]; };
        g.globalCompositeOperation = "lighter";
        for (const bd of bands) {
          for (let i = 0; i < 330; i++) { const [x, y] = onBand(bd, Math.random(), slR(-1, 1) * slR(0, bd.wid)); blob(x, y, slR(20, 76), [FOREST, PINE, EMERALD, JADE][Math.random() * 4 | 0], slR(.022, .042)); }
          for (let i = 0; i < 170; i++) { const [x, y] = onBand(bd, Math.random(), slR(-1, 1) * slR(0, bd.wid * .55)); blob(x, y, slR(7, 28), [JADE, SEAFOAM, MINT, MINT][Math.random() * 4 | 0], slR(.026, .05)); }
        }
        for (let f = 0; f < 30; f++) {
          let x = slR(0, S), y = slR(0, S), ang = slR(0, 6.28); const col = [JADE, SEAFOAM, MINT][f % 3], len = slR(110, 290);
          for (let k = 0; k < len; k += 4) { ang += slR(-.05, .05); x += Math.cos(ang) * 4; y += Math.sin(ang) * 4; blob(x, y, slR(3, 7), col, .06); }
        }
        for (let i = 0; i < 26; i++) {
          const a = slR(0, 6.28), L = slR(m * .3, m * .85), w = slR(.003, .01);
          const lg = g.createLinearGradient(m, m, m + Math.cos(a) * L, m + Math.sin(a) * L); lg.addColorStop(0, "rgba(190,255,228,.08)"); lg.addColorStop(1, "rgba(190,255,228,0)");
          g.fillStyle = lg; g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(a - w) * L, m + Math.sin(a - w) * L); g.lineTo(m + Math.cos(a + w) * L, m + Math.sin(a + w) * L); g.closePath(); g.fill();
        }
        blob(m, m, m * .6, EMERALD, .14); blob(m, m, m * .24, MINT, .22); blob(m, m, m * .05, "225,255,240", .6);
        g.globalCompositeOperation = "source-over";
        for (const bd of bands) for (let i = 0; i < 200; i++) { const [x, y] = onBand(bd, Math.random(), (Math.random() < .5 ? -1 : 1) * bd.wid * slR(.5, .9)); blob(x, y, slR(5, 18), "4,34,24", slR(.08, .16)); }
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 2000; i++) {
          const bd = bands[i % bands.length], [bx, by] = onBand(bd, Math.random(), slR(-1, 1) * bd.wid);
          const [x, y] = Math.random() < .5 ? [bx, by] : [slR(0, S), slR(0, S)], a = slR(.25, 1);
          g.fillStyle = Math.random() < .1 ? `rgba(245,225,165,${a})` : Math.random() < .35 ? `rgba(200,255,232,${a})` : `rgba(255,255,255,${a})`;
          const z = Math.random() < .03 ? 1.6 : slR(.5, 1.1); g.fillRect(x, y, z, z);
        }
        for (let i = 0; i < 18; i++) { const bd = bands[i % bands.length], [x, y] = onBand(bd, Math.random(), slR(-1, 1) * bd.wid * .6); g.globalAlpha = slR(.5, 1); const z = slR(14, 28); g.drawImage(slSprite("star", "#c9ffe9"), x - z / 2, y - z / 2, z, z); }
        g.globalAlpha = 1;
        cv.toBlob(b => { if (b) SL.nebula = URL.createObjectURL(b); done(); }, "image/jpeg", .88);
      } catch { done(); }
    };
    if (now) setTimeout(go, 0); else (window.requestIdleCallback || (f => setTimeout(f, 60)))(go, { timeout: 1500 });
  });
}

// ---- the transformation ----
// A rectangle with a round hole of radius rad at (hx, hy), as one polygon (evenodd cuts the hole out), so the
// hole can grow as an ordinary clip-path animation.
function slHoled(w, h, hx, hy, rad) {
  const pts = ["0 0", `${w}px 0`, `${w}px ${h}px`, `0 ${h}px`, "0 0"];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; pts.push(`${(hx + Math.cos(a) * rad).toFixed(1)}px ${(hy + Math.sin(a) * rad).toFixed(1)}px`); }
  pts.push("0 0");
  return `polygon(evenodd, ${pts.join(", ")})`;
}
// The panels that transform when a whole page changes: the outermost ones on screen.
const SL_BOXES = ".sheet, .summary, .bench, .empty, .signin-note, .snap-banner, .compare, .checks, .inc, .check-input, .backup-warn";
function slBoxesOf(target) {
  const all = [...target.querySelectorAll(SL_BOXES)].filter(el => !el.parentElement.closest(SL_BOXES));
  const shown = all.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
  return shown.length ? shown.slice(0, 8) : [target];
}
// mode: "view" (a whole page), "pop" (a popup or a section folding open), "tab" (a tab's contents), "img" (a card picture)
const SL_TIME = { view: [820, 900, 400], pop: [560, 640, 320], tab: [320, 460, 240], img: [200, 320, 160] };
function starTransform(target, mode = "view") {
  if (!target || !target.isConnected) return;
  const [gather, open, fadeT] = SL_TIME[mode] || SL_TIME.pop, total = gather + open + fadeT, g = gather / total, go = (gather + open) / total;
  const small = mode === "tab" || mode === "img";
  // a whole page or popup replaces the one before it; a card picture runs alongside
  if (mode !== "img" && SL.view) SL.view();
  slPaint(); slCanvas();
  const parts = [], anims = [], boxes = [], out = "cubic-bezier(.25,.6,.3,1)", now = performance.now();
  if (mode === "view") anims.push(target.animate([{ opacity: 0 }, { opacity: 1, offset: g * .8 }, { opacity: 1 }], { duration: total }));
  const list = mode === "view" ? slBoxesOf(target) : [target];
  list.forEach((el, k) => {
    const r = el.getBoundingClientRect(), top = Math.max(0, r.top), bot = Math.min(innerHeight, r.bottom), w = r.width, h = bot - top;
    if (h <= 4 || w <= 4) return;
    const radius = getComputedStyle(el).borderRadius, delay = mode === "view" ? k * 70 : 0;
    const box = { left: r.left + "px", top: top + "px", width: w + "px", height: h + "px", borderRadius: radius };
    const hx = w / 2, hy = h / 2, far = Math.hypot(hx, hy) + 8;
    boxes.push({ x: r.left, y: top, w, h, rad: parseFloat(radius) || 0 });
    // the nebula, in two layers that swell outward from the center (the nearer one faster), turning slowly
    const gal = document.createElement("div"); gal.className = "sl-gal" + (mode === "img" || mode === "pop" ? " up" : ""); gal.setAttribute("aria-hidden", "true");
    Object.assign(gal.style, box, { opacity: 0 });
    const side = Math.hypot(w, h) * 1.15, sky = { width: side + "px", height: side + "px", marginLeft: -side / 2 + "px", marginTop: -side / 2 + "px" };
    if (SL.nebula) sky.backgroundImage = `url(${SL.nebula})`;
    const n1 = document.createElement("div"), n2 = document.createElement("div"), gleam = document.createElement("div");
    n1.className = "sl-neb"; n2.className = "sl-neb near"; gleam.className = "sl-gleam";
    Object.assign(n1.style, sky); Object.assign(n2.style, sky);
    if (!SL.nebula) SL.painting.then(() => { if (SL.nebula && n1.isConnected) n1.style.backgroundImage = n2.style.backgroundImage = `url(${SL.nebula})`; });
    gal.append(n1, n2, gleam);
    // the ring of light, kept inside the box
    const rimbox = document.createElement("div"); rimbox.className = "sl-rimbox" + (mode === "img" || mode === "pop" ? " up" : ""); rimbox.setAttribute("aria-hidden", "true"); Object.assign(rimbox.style, box);
    const rim = document.createElement("div"); rim.className = "sl-rim";
    Object.assign(rim.style, { left: (hx - far) + "px", top: (hy - far) + "px", width: far * 2 + "px", height: far * 2 + "px", opacity: 0 });
    rimbox.appendChild(rim);
    document.body.append(gal, rimbox); parts.push(gal, rimbox);
    const opt = { duration: total, delay, fill: "both" };
    anims.push(gal.animate([
      { opacity: 0, clipPath: slHoled(w, h, hx, hy, 0) },
      { opacity: 1, clipPath: slHoled(w, h, hx, hy, 0), offset: g * .6 },
      { opacity: 1, clipPath: slHoled(w, h, hx, hy, 0), offset: g, easing: out },
      { opacity: 1, clipPath: slHoled(w, h, hx, hy, far), offset: go },
      { opacity: 0, clipPath: slHoled(w, h, hx, hy, far) }], opt));
    const swell = { duration: total, delay, fill: "both", easing: "cubic-bezier(.15,.55,.35,1)" };
    anims.push(n1.animate([{ transform: "rotate(-8deg) scale(.7)" }, { transform: "rotate(14deg) scale(1.18)" }], swell));
    anims.push(n2.animate([{ transform: "rotate(30deg) scale(.45)", opacity: 0 }, { opacity: .24, offset: .3 }, { transform: "rotate(-6deg) scale(1.6)", opacity: .14 }], swell));
    const glide = `translateX(${(w * 1.6 + 200) | 0}px)`;
    anims.push(gleam.animate([{ transform: "translateX(0)" }, { transform: "translateX(0)", offset: g * .6 }, { transform: glide, offset: Math.min(1, g * 1.05) }, { transform: glide }], opt));
    anims.push(rim.animate([
      { transform: "scale(0)", opacity: 0 },
      { transform: "scale(0)", opacity: 1, offset: g, easing: out },
      { transform: "scale(1)", opacity: .95, offset: go },
      { transform: "scale(1)", opacity: 0 }], opt));
    // twinkles inside, then strands of light sweeping across and crossing while it fills
    const n = Math.min(small ? 8 : 26, Math.round(w * h / 9000)) + (small ? 2 : 6);
    for (let i = 0; i < n; i++) slSpark(slR(r.left + 8, r.right - 8), slR(top + 8, bot - 8), { vx: 0, vy: 0, g: 0, max: gather + slR(0, 200), size: slR(2, 5.5), c: ["#ffffff", "#c9ffe9", "#8ff2c9", "#f3dca0"][Math.random() * 4 | 0], delay });
    const nR = mode === "img" ? 1 : mode === "tab" ? 3 : mode === "pop" ? 4 : Math.min(6, 3 + Math.round(w * h / 160000));
    for (let i = 0; i < nR; i++) {
      const dir = i % 2 ? -1 : 1, amp = slR(.12, .32) * h, waves = slR(.6, 1.4), ph = slR(0, 6.28), lean = slR(-.35, .35) * h, mid = top + h * slR(.25, .75);
      SL.ribbons.push({ at: now + delay + i * (gather * .3 / nR), dur: gather * slR(.6, .7), trail: slR(.3, .4), c: SL_RIBBON[i % 5], width: small ? slR(3, 5) : slR(5, 9),
        at2: u => { const x = dir > 0 ? u : 1 - u; return [r.left - 30 + x * (w + 60), mid + Math.sin(ph + x * waves * 6.28) * amp + (x - .5) * lean]; } });
    }
    boxes[boxes.length - 1].emit = { cx: r.left + hx, cy: top + hy, far, delay };
  });
  if (!boxes.length) { anims.forEach(a => a.cancel()); return; }
  SL.clips.add(boxes); slCanvas();
  // sparkles flying off the ring as it opens
  let alive = true;
  (function emit(t) {
    if (!alive) return;
    for (const b of boxes) {
      const e = t - now - b.emit.delay;
      if (e > gather && e < gather + open) {
        const rad = b.emit.far * (1 - Math.pow(1 - (e - gather) / open, 2.2));
        for (let i = 0; i < (small ? 2 : 5); i++) {
          const a = slR(0, 6.28), x = b.emit.cx + Math.cos(a) * rad, y = b.emit.cy + Math.sin(a) * rad;
          if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) slSpark(x, y, { vx: Math.cos(a) * slR(.15, .55), vy: Math.sin(a) * slR(.15, .55), max: slR(350, 700), size: slR(1.8, 5), g: 0 });
        }
      }
    }
    if (t - now < total + 400) requestAnimationFrame(emit);
  })(now);
  const end = () => {
    if (!alive) return; alive = false;
    anims.forEach(a => a.cancel()); parts.forEach(p => p.remove()); SL.clips.delete(boxes);
    if (SL.view === end) SL.view = null;
  };
  if (mode !== "img") SL.view = end;
  setTimeout(end, total + 70 * boxes.length + 60);
}
// The panels sit still on screen while they transform, so scrolling or resizing ends it early.
addEventListener("scroll", () => { if (SL.view) SL.view(); }, { passive: true });
addEventListener("resize", () => { if (SL.view) SL.view(); });

// The loading screen in Starlight: a glinting star and "Gathering starlight"; it bursts into sparkles and fades
// as the page transforms in.
function starReveal(boot) {
  slPaint();
  slCanvas();
  const r = boot.querySelector(".boot-star i")?.getBoundingClientRect(), x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight / 2;
  for (let i = 0; i < 36; i++) { const a = i / 36 * 6.28, v = slR(.9, 2); slSpark(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: slR(600, 1000), size: slR(2, 6), g: 0 }); }
  boot.classList.add("star-out");
  Promise.race([SL.painting, new Promise(res => setTimeout(res, 900))]).then(() => {
    starTransform($(".view"), "view");
    setTimeout(() => boot.remove(), 420);
  });
}
// In Starlight, paint the nebula while the loading screen is still up, so the first transformation has it.
if (document.documentElement.dataset.theme === "starlight") slPaint(true);
