// The living background behind the Deck Ledger (Marathon-style):
//   a grid of squares inside a console frame, with a slow wave of lighter and darker squares rolling from the
//   bottom right to the top left; chip blocks, traces and a braided band laid over it with short "weave worms"
//   crawling along them; terminal readouts typing in the margins over faint rails.
// Colours come from the theme (--bd-* in css/style.css). It redraws 20 times a second, stops while the tab is
// hidden, and draws one still frame for anyone set to reduce motion. js/app.js passes in the deck names
// (window.LedgerBackdrop.setDecks) and asks for a redraw when the theme changes (refresh).
(() => {
  "use strict";
  if (!document.body || !HTMLCanvasElement.prototype.getContext) return;
  const cv = document.createElement("canvas"); cv.id = "bd"; cv.setAttribute("aria-hidden", "true");
  const cx = cv.getContext("2d"); if (!cx) return;
  const frameEl = document.createElement("div"); frameEl.className = "bd-frame"; frameEl.setAttribute("aria-hidden", "true");
  const d = new Date(), stamp = [d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, "0")).join(".") + "." + d.getFullYear();
  frameEl.innerHTML = `<div class="edge e-top"><span class="dots"><i></i><i></i><i></i></span><span>Ledger_terminals_online</span><span>Node ${String(1000 + Math.floor(Math.random() * 9000))} // ${stamp}</span></div>`
    + `<div class="edge e-bot"><span>CDL-NET // sync_approved</span><span>Sectors secured</span><span>Bin_link stable</span></div>`
    + `<i class="tick tl"></i><i class="tick tr"></i><i class="tick bl"></i><i class="tick br"></i><i class="rule a"></i><i class="rule b"></i><i class="rule c"></i><i class="rule d"></i>`;
  document.body.prepend(frameEl); document.body.prepend(cv);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const S = { level: 0, grid: true, term: true, rails: true, geo: true }; // the quiet strength
  let wideMode = false, W = 0, H = 0, dpr = 1, C = {}, grid = null, rails = [], railBox = null, terms = [], clock = 0, inner = null, zones = [], geo = null, worms = [];
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));      // whole number from a to b
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const chance = p => Math.random() < p;
  const hex = n => Array.from({ length: n }, () => "0123456789ABCDEF"[R(0, 15)]).join("");

  // ---------- colors from the theme ----------
  function readColors() {
    const st = getComputedStyle(document.documentElement);
    const v = n => st.getPropertyValue(n).trim();
    const bg = v("--bg").replace("#", ""), lum = bg.length >= 6 ? (parseInt(bg.slice(0, 2), 16) + parseInt(bg.slice(2, 4), 16) + parseInt(bg.slice(4, 6), 16)) / 765 : 1;
    C = { bg: v("--bg"), ink: v("--ink"), acid: v("--acid"), dark: lum < .5,
      grid: v("--bd-grid"), trace: v("--bd-trace"), weave: v("--bd-weave"), worm: v("--bd-worm"), text: v("--bd-text"), hi: v("--bd-hi") };
  }
  function rgba(hexc, a) {
    const h = hexc.replace("#", ""); const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
  }
  // Quiet, medium, loud: how far the wave swings between darker and lighter grey, and how fast it rolls.
  const STRENGTH = [{ swing: .5, speed: .6, text: .8 }, { swing: 1, speed: 1, text: 1 }, { swing: 1.6, speed: 1.5, text: 1.25 }];

  // ---------- layout ----------
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const content = Math.min(1240, W), side = (W - content) / 2, wide = side > 150; wideMode = wide;
    // Inside the console frame (10px from the edges, below and above its 26px label strips).
    inner = [12, 38, W - 24, H - 76];
    // Rails: tall rounded bars behind the left readout, like the game's loading screen.
    const rx = wide ? 18 : 8, rw = wide ? Math.min(side - 40, 230) : Math.min(W * .5, 220), ry = wide ? H * .44 : H * .58, rh = wide ? H * .5 : H * .36;
    rails = []; const n = 5, bw = rw / n;
    for (let k = 0; k < n; k++) rails.push([rx + k * bw + bw * .12, ry, bw * .76, rh]);
    railBox = [rx - 6, ry - 6, rw + 12, rh + 12];
    // Terminal readouts: one over the rails, one high on the right.
    // Without side margins (phones, most laptops) only the lower-left readout runs, so text never sits beside
    // the title or between the top bar's buttons.
    terms = [
      { x: rx + 6, y0: ry + 14, maxW: wide ? side - 40 : W * .55, side: "left" },
      ...(wide ? [{ x: W - side + 18, y0: H * .07 + 30, maxW: side - 36, side: "right" }] : []),
    ].map(t => Object.assign(t, { y: t.y0, lines: [], pos: 0, hold: 0, scramble: 0, speed: 70, box: null }));
    // The grid: squares everywhere; the ones under the rails and readouts are skipped as it draws.
    const pitch = W < 600 ? 11 : 13, size = pitch - 4;
    const cols = Math.ceil(W / pitch), rows = Math.ceil(H / pitch);
    const phase = new Float32Array(cols * rows), grain = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = c * pitch, y = r * pitch;
      phase[i] = ((W - x) + (H - y)) / (W + H); // 0 at the bottom right, 1 at the top left
      grain[i] = Math.random();
    }
    grid = { pitch, size, cols, rows, phase, grain, off: (W % pitch) / 2 };
    terms.forEach(t => newScript(t, true));
    // Space kept for the rails and the readouts at their largest, so traces and chips stay out of it.
    const lhMax = (W < 600 ? 8 : 9) * 1.5;
    zones = [railBox, ...terms.slice(1).map(t => [t.x - 10, t.y0 - 3 * lhMax - 10, t.maxW + 20, H * .34 + 6 * lhMax + 20])];
    buildGeometry();
  }

  // ---------- terminal readouts, written fresh each time ----------
  // Built from many pieces with random numbers, names and order, so the same text rarely comes round twice.
  // Deck names come from the site; until then (or with no decks) these stand in.
  let DECKS = ["ZAGRAS", "RAT PACK", "NINJA TURN", "LIFEGAIN CHOIR", "CONSTRUCT SHOP", "SPELLSLINGER", "DRAGON HOARD", "TOKEN STORM"];
  const SUBJ = ["LEDGER", "DECKS", "BIN", "HISTORY", "COMBOS", "INCOMING", "OWNED", "CORES", "SHELL", "SECTORS", "CACHE", "NODE", "LINK", "INDEX"];
  const STATE = ["APPROVED", "STABLE", "NOMINAL", "READY", "ALIGNED", "CLEAR", "HELD", "SEALED", "SYNCED"];
  const OPEN = () => pick([
    "[WAKE]", "[RESUME]", "[COLD BOOT]", "[HANDSHAKE]", "[RELINK]", "[WARM START]",
    pick(["NN", "DECK", "BIN", "LEDGER", "SYNC", "COMBO", "NODE"]) + "_LINK ESTABLISHING_",
    "REMOTE OVERRIDE 0x" + hex(4), "NODE " + R(1000, 9999) + " // SESSION " + hex(3),
    "SIGNALS_" + pick(["ALIGNED", "RECOVERED", "TRACED", "FILTERED"]),
  ]);
  const CLOSE = () => pick([
    "[LINKS ESTABLISHED]", "[SYSTEM CLEAR " + R(1, 4) + "]", "[SYNC WRITTEN]", "[STANDARD WRITTEN]", "CDL CONNECTED",
    "INTERFACE READY", "[SECTORS SEALED]", "[LEDGER CURRENT]", "[NODE " + R(10, 99) + " RELEASED]", "AWAITING INPUT_",
  ]);
  const lead = (s, n, end) => s + " " + ". ".repeat(Math.max(1, Math.floor((n - s.length) / 2))) + end;
  const BLOCKS = [
    () => Array.from({ length: R(2, 4) }, () => "SEN (" + pick(SUBJ) + ") " + pick(STATE)),
    () => { const n = R(3, 7), what = pick(["BIN", "HISTORY", "OWNED", "CACHE", "INDEX"]); const out = ["  (" + what + ") SECTORS 1-" + n + " " + pick(["WRITE", "READ", "PARITY", "SEAL"]) + " CHECK"];
      for (let k = 1; k <= n; k++) out.push(lead("    #" + k, 28, chance(.08) ? "RETRY" : chance(.05) ? "SKIP" : "OK"));
      return out; },
    () => { const names = [...DECKS].sort(() => Math.random() - .5).slice(0, R(2, 5));
      return names.map(d => lead("  VERIFYING " + d.slice(0, 16), 28, chance(.08) ? "HELD" : "OK")); },
    () => { const n = R(0, 3); const out = [lead("IRREGULARITIES DETECTED", 26, String(n))];
      if (n) out.push("  SUPPRESSING " + pick(["INSULA", "SECTOR", "BIN", "INDEX", "CACHE"]) + " DISSONANCE"); return out; },
    () => [lead(pick(["INCOMING QUEUE", "COMBO INDEX", "OWNED DELTA", "SWAPS PENDING", "HISTORY PIECES", "BIN SECTIONS"]), 26, String(R(0, 40)))],
    () => Array.from({ length: R(1, 3) }, () => "0x" + hex(4) + " " + hex(4) + " " + hex(4) + " " + hex(2)),
    () => { const steps = [R(8, 30), R(35, 60), R(62, 90), 100]; const w = pick(["VERIFYING", "DEFRAGMENTING", "INDEXING", "RECONCILING", "WRITING"]);
      return steps.slice(R(0, 2)).map(p => w + "_ " + String(p).padStart(3, " ") + "%"); },
    () => ["INITIALIZING_", "  " + pick(["SHELL", "CORE", "LINK", "CACHE"]) + " SYSTEMS " + pick(["CONNECTED", "WARM", "ONLINE"]), chance(.5) ? "  (" + pick(SUBJ) + ") BANKS 1-" + R(3, 8) + " READY" : "  LATENCY " + R(9, 140) + "MS"],
    () => ["REVIEW " + pick(["COMPLETE", "PASSED", "FILED"]), "  " + R(10, 99) + " ENTRIES // " + R(1, 12) + " PIECES"],
    () => [pick(["CONTRACTS", "LEDGERS", "BRACKETS", "ROLES"]) + "_LNK EST" + pick(["ø", "#", "_"]), lead("  PRIORITY", 26, "OK"), lead("  STANDARD", 26, chance(.85) ? "OK" : "HELD")],
  ];
  const recentOpen = [];
  function newScript(t, first) {
    let open; do { open = OPEN(); } while (recentOpen.includes(open) && recentOpen.length < 12);
    recentOpen.push(open); if (recentOpen.length > 8) recentOpen.shift();
    const order = BLOCKS.map((_, k) => k).sort(() => Math.random() - .5).slice(0, R(2, 4));
    let lines = [open];
    for (const k of order) { if (chance(.4)) lines.push(""); lines.push(...BLOCKS[k]()); }
    if (chance(.6)) lines.push("");
    lines.push(CLOSE());
    // Fit the space: never taller than the rails (left) or a third of the screen (right).
    const fs = W < 600 ? 8 : 9, lh = fs * 1.5, maxLines = Math.max(6, Math.floor((t.side === "left" ? railBox[3] - 24 : H * .34) / lh));
    t.lines = lines.slice(0, maxLines);
    t.fs = fs; t.lh = lh;
    t.y = t.y0 + (first ? 0 : R(-2, 3) * lh);           // shift the block a little each time
    t.speed = R(45, 110);                                // and type at a different pace
    t.holdFor = 3 + Math.random() * 6;
    t.pos = first ? Math.floor(t.lines.join("\n").length * Math.random() * .6) : 0; t.hold = 0; t.scramble = 0;
    cx.font = `400 ${fs}px "Martian Mono", ui-monospace, monospace`;
    const w = Math.min(t.maxW, Math.max(...t.lines.map(l => cx.measureText(l).width)) + 18);
    t.box = [t.x - 8, t.y - 8, w + 16, t.lines.length * lh + 16]; // the grid leaves this space clear
  }
  const GLYPHS = "▚▞▟▙░▒#%&@$*+=/\\<>_01";

  // ---------- drawing ----------
  function drawRails() {
    if (!S.rails) return;
    cx.fillStyle = rgba(C.grid, C.dark ? .03 : .05);
    for (const [x, y, w, h] of rails) { cx.beginPath(); cx.roundRect(x, y, w, h, w / 2); cx.fill(); }
  }
  const inBox = (b, x, y, s) => b && x + s > b[0] && x < b[0] + b[2] && y + s > b[1] && y < b[1] + b[3];
  // A grey wave rolling from the bottom right to the top left: each square sits somewhere between a darker
  // and a lighter grey depending on where the wave is. Squares are grouped into a few shades so it draws fast.
  const SHADES = 9;
  function drawGrid(st) {
    if (!S.grid || !grid) return;
    cx.save(); cx.beginPath(); cx.rect(...inner); cx.clip();
    const g = grid, buckets = Array.from({ length: SHADES }, () => []);
    const skip = [S.rails ? railBox : null, ...(S.term ? terms.filter(t => !t.hidden).map(t => t.box) : [])];
    const tt = clock * .045 * st.speed;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c, x = g.off + c * g.pitch, y = r * g.pitch;
      if (skip.some(b => inBox(b, x, y, g.size))) continue;
      // two overlapping swells of different widths, plus a little fixed grain so it isn't too smooth
      const p = g.phase[i];
      const v = .55 * Math.sin((p * 3.2 - tt) * Math.PI * 2) + .3 * Math.sin((p * 7.5 - tt * 1.7) * Math.PI * 2) + (g.grain[i] - .5) * .35;
      const k = Math.max(0, Math.min(SHADES - 1, Math.round((v + 1.1) / 2.2 * (SHADES - 1))));
      buckets[k].push(x, y);
    }
    const base = C.dark ? .028 : .035, span = (C.dark ? .085 : .085) * st.swing;
    for (let k = 0; k < SHADES; k++) {
      const b = buckets[k]; if (!b.length) continue;
      cx.fillStyle = rgba(C.grid, base + span * (k / (SHADES - 1)) ** 1.6);
      for (let j = 0; j < b.length; j += 2) cx.fillRect(b[j], b[j + 1], g.size, g.size);
    }
    cx.restore();
  }

  // ---------- circuits, weave and worms ----------
  // Original chip-style infrastructure on the grid's lattice: chip blocks with pins, traces running along the
  // gaps between squares with 45-degree bends (sometimes as parallel buses) ending in vias and pads, and one
  // band of three strands braided over and under each other. Drawn once to a hidden canvas; only the worms move.
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function buildGeometry() {
    const g = grid, gap = g.pitch - g.size, P = g.pitch;
    const X = c => g.off + c * P - gap / 2, Y = r => r * P - gap / 2;              // gap-centre lattice
    const c0 = Math.ceil((inner[0] - g.off) / P) + 1, c1 = Math.floor((inner[0] + inner[2] - g.off) / P) - 1;
    const r0 = Math.ceil(inner[1] / P) + 1, r1 = Math.floor((inner[1] + inner[3]) / P) - 1;
    const blocked = (x, y, pad = 6) => zones.some(z => z && x > z[0] - pad && x < z[0] + z[2] + pad && y > z[1] - pad && y < z[1] + z[3] + pad);
    const used = new Set(), key = (c, r) => c + "," + r;
    const free = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1 && !used.has(key(c, r)) && !blocked(X(c), Y(r));
    const off = document.createElement("canvas"); off.width = cv.width; off.height = cv.height;
    const o = off.getContext("2d"); o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.save(); o.beginPath(); o.rect(...inner); o.clip();
    const ink = a => rgba(C.trace, a), traceA = C.dark ? .085 : .16, paths = [];
    const wide = W > 900;

    // Chip blocks: a frame with pins on every side; some pins launch traces.
    const chips = [], nChips = wide ? R(2, 3) : 1;
    for (let tries = 0; chips.length < nChips && tries < 200; tries++) {
      const w = R(5, 9), h = R(3, 6), c = R(c0 + 2, c1 - w - 2), r = R(r0 + 2, r1 - h - 2);
      let ok = true;
      for (let cc = c - 2; cc <= c + w + 2 && ok; cc++) for (let rr = r - 2; rr <= r + h + 2; rr++) if (!free(cc, rr)) { ok = false; break; }
      if (!ok) continue;
      for (let cc = c - 1; cc <= c + w + 1; cc++) for (let rr = r - 1; rr <= r + h + 1; rr++) used.add(key(cc, rr));
      chips.push({ c, r, w, h });
    }
    for (const ch of chips) {
      const x = X(ch.c), y = Y(ch.r), w = ch.w * P, h = ch.h * P;
      o.fillStyle = C.bg; o.fillRect(x, y, w, h);                                     // the chip covers the squares under it
      o.fillStyle = ink(C.dark ? .05 : .07); o.fillRect(x, y, w, h);
      o.strokeStyle = ink(traceA * 1.4); o.lineWidth = 1.5; o.strokeRect(x + .75, y + .75, w - 1.5, h - 1.5);
      o.fillStyle = ink(traceA * 1.6); o.fillRect(x + 4, y + 4, 4, 4);                // pin-one mark
      o.strokeStyle = ink(traceA); o.lineWidth = 1.5; o.beginPath();
      for (let k = 1; k < ch.w; k++) { o.moveTo(X(ch.c + k), y); o.lineTo(X(ch.c + k), y - P * .6); o.moveTo(X(ch.c + k), y + h); o.lineTo(X(ch.c + k), y + h + P * .6); }
      for (let k = 1; k < ch.h; k++) { o.moveTo(x, Y(ch.r + k)); o.lineTo(x - P * .6, Y(ch.r + k)); o.moveTo(x + w, Y(ch.r + k)); o.lineTo(x + w + P * .6, Y(ch.r + k)); }
      o.stroke();
      // launch a few traces from the pins
      const pins = [];
      for (let k = 1; k < ch.w; k++) { pins.push([ch.c + k, ch.r - 1, 6]); pins.push([ch.c + k, ch.r + ch.h + 1, 2]); }
      for (let k = 1; k < ch.h; k++) { pins.push([ch.c - 1, ch.r + k, 4]); pins.push([ch.c + ch.w + 1, ch.r + k, 0]); }
      pins.sort(() => Math.random() - .5).slice(0, R(3, 6)).forEach(([c, r, d]) => { used.delete(key(c, r)); route(c, r, d, R(1, 3)); });
    }
    // Free-standing traces, some as buses of parallel lines.
    const nTraces = wide ? R(10, 16) : R(5, 8);
    for (let k = 0; k < nTraces; k++) {
      for (let tries = 0; tries < 40; tries++) { const c = R(c0, c1), r = R(r0, r1); if (free(c, r)) { route(c, r, pick([0, 2, 4, 6]), chance(.3) ? R(2, 4) : 1); break; } }
    }
    // Walk a route from (c, r): straight runs with 45-degree turns, as one line or a bus of parallel lines.
    function route(c, r, d, lanes) {
      const steps = []; let cc = c, rr = r, dir = d, len = R(18, 70), run = R(3, 10);
      for (let s = 0; s < len; s++) {
        if (run-- <= 0) { dir = (dir + pick([1, -1, 1, -1, 2, -2]) + 8) % 8; run = R(3, 12); }
        const [dx, dy] = DIRS[dir], nc = cc + dx, nr = rr + dy;
        // a bus needs room for every lane
        const ok = [...Array(lanes).keys()].every(l => { const [px, py] = perp(dir, l); return free(nc + px, nr + py); });
        if (!ok) { if (chance(.5)) { dir = (dir + pick([1, -1]) + 8) % 8; run = R(2, 6); continue; } break; }
        steps.push(dir); cc = nc; rr = nr;
        for (let l = 0; l < lanes; l++) { const [px, py] = perp(dir, l); used.add(key(cc + px, rr + py)); }
      }
      if (steps.length < 4) return;
      for (let l = 0; l < lanes; l++) {
        const [px, py] = perp(steps[0], l); let pc = c + px, pr = r + py; const pts = [[X(pc), Y(pr)]];
        for (const sd of steps) { const [dx, dy] = DIRS[sd]; const [qx, qy] = perp(sd, l), [ox, oy] = perp(steps[0], l); pc += dx; pr += dy; pts.push([X(pc + qx - ox), Y(pr + qy - oy)]); }
        paths.push(pts);
        o.strokeStyle = ink(traceA); o.lineWidth = 1.5; o.lineJoin = "round"; o.beginPath(); pts.forEach(([x, y], i) => i ? o.lineTo(x, y) : o.moveTo(x, y)); o.stroke();
        const [ex, ey] = pts[pts.length - 1];
        if (chance(.55)) { o.strokeStyle = ink(traceA * 1.5); o.lineWidth = 1.5; o.beginPath(); o.arc(ex, ey, 3, 0, Math.PI * 2); o.stroke(); }  // via
        else { o.fillStyle = ink(traceA * 1.5); o.fillRect(ex - 3, ey - 3, 6, 6); }                                                         // pad
      }
    }
    // The woven band: three strands braiding over and under each other.
    const strands = weave(o, X, Y, c0, c1, r0, r1, blocked, a => rgba(C.weave, C.dark ? a : a * 1.5), traceA);
    o.restore();
    geo = { off, paths: paths.concat(strands) };
    worms = Array.from({ length: wide ? 4 : 2 }, () => newWorm(true));
  }
  // Sideways offset of lane l for a route heading in direction d (lanes sit side by side).
  function perp(d, l) { const [dx, dy] = DIRS[(d + 2) % 8]; return [Math.sign(dx) * l, Math.sign(dy) * l]; }
  function weave(o, X, Y, c0, c1, r0, r1, blocked, ink, traceA) {
    const P = grid.pitch, wide = W > 900;
    // A long horizontal band low on the screen (or across the lower right on phones).
    const y0 = Y(Math.max(r0 + 4, Math.min(r1 - 4, Math.round((inner[1] + inner[3] * (wide ? .88 : .8)) / P))));
    const x0 = X(c0 + 1), x1 = X(c1 - 1), amp = P * 1.6, period = P * 10, out = [];
    const strandPts = k => { const pts = []; for (let x = x0; x <= x1; x += P / 2) {
      const t = ((x - x0) / period + k / 3) % 1, tri = t < .5 ? t * 4 - 1 : 3 - t * 4;   // a zig-zag, 45-degree slopes
      pts.push([x, y0 + Math.max(-1, Math.min(1, tri * 1.25)) * amp]); } return pts; };
    const S3 = [0, 1, 2].map(strandPts);
    const line = (pts, a, w) => { o.strokeStyle = a; o.lineWidth = w; o.lineJoin = "round"; o.lineCap = "round"; o.beginPath(); pts.forEach(([x, y], i) => i ? o.lineTo(x, y) : o.moveTo(x, y)); o.stroke(); };
    // keep the band clear of the rails and readouts by cutting strands where they'd pass through
    const pieces = pts => { const runs = []; let cur = []; for (const p of pts) { if (blocked(p[0], p[1], 10)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p); } if (cur.length > 1) runs.push(cur); return runs; };
    // Over and under: each strand is drawn with a gap cut around it (in the page colour) on alternating stretches.
    S3.forEach(pts => pieces(pts).forEach(run => line(run, ink(traceA * 1.2), 2)));
    S3.forEach((pts, k) => {
      for (let seg = 0; seg * period / 2 < x1 - x0; seg++) {
        if ((seg + k) % 3) continue;                                                       // this strand is on top here
        const a = x0 + seg * period / 2 - (k / 3) * period, b = a + period / 2;
        const part = pts.filter(([x]) => x >= a && x <= b);
        pieces(part).forEach(run => { line(run, C.bg, 6); line(run, ink(traceA * 1.2), 2); });
      }
    });
    // rungs between the outer strands, like a ladder of tissue
    o.strokeStyle = ink(traceA * .6); o.lineWidth = 1; o.beginPath();
    for (let i = 0; i < S3[0].length; i += 4) { const [x, ya] = S3[0][i], yb = S3[2][i][1]; if (!blocked(x, ya, 10) && !blocked(x, yb, 10)) { o.moveTo(x, ya); o.lineTo(x, yb); } }
    o.stroke();
    S3.forEach(pts => pieces(pts).forEach(run => out.push(run)));
    return out;
  }
  // Weave worms: short chains of squares that crawl along a trace or strand, head first, tail fading.
  function newWorm(first) {
    const paths = geo ? geo.paths.filter(p => p.length > 6) : [];
    if (!paths.length) return null;
    const pts = pick(paths), rev = chance(.5), list = rev ? [...pts].reverse() : pts;
    const lens = [0]; for (let i = 1; i < list.length; i++) lens.push(lens[i - 1] + Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1]));
    return { pts: list, lens, d: first ? Math.random() * lens[lens.length - 1] : -10, speed: R(22, 55), segs: R(5, 11), wait: 0 };
  }
  function along(w, d) {
    const L = w.lens; if (d <= 0) return w.pts[0]; if (d >= L[L.length - 1]) return w.pts[w.pts.length - 1];
    let i = 1; while (L[i] < d) i++;
    const t = (d - L[i - 1]) / (L[i] - L[i - 1]), a = w.pts[i - 1], b = w.pts[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function drawGeo(dt, st, still) {
    if (!S.geo || !geo) return;
    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(geo.off, 0, 0); cx.restore();
    cx.save(); cx.beginPath(); cx.rect(...inner); cx.clip();
    worms = worms.map(w => {
      if (!w) return newWorm(false);
      if (!still) w.d += dt * w.speed * st.speed;
      const end = w.lens[w.lens.length - 1];
      if (w.d - w.segs * 6 > end) return chance(.02) ? newWorm(false) : w;               // gone; a new one sets off after a pause
      for (let k = w.segs - 1; k >= 0; k--) {
        const d = w.d - k * 6; if (d < 0 || d > end) continue;
        const [x, y] = along(w, d), f = 1 - k / w.segs, s = k === 0 ? 5 : 4;
        cx.fillStyle = rgba(C.worm, (C.dark ? .34 : .6) * f * Math.min(1.2, st.swing + .3));
        cx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
      return w;
    });
    cx.restore();
  }
  // Without side margins the readout only shows where the page isn't (below the content), never under text.
  const page = document.getElementById("app");
  const underPage = b => { if (wideMode || !page || !b) return false; const r = page.getBoundingClientRect(); return b[1] < r.bottom && b[1] + b[3] > r.top; };
  function drawTerms(dt, st, still) {
    if (!S.term) return;
    cx.save(); cx.beginPath(); cx.rect(...inner); cx.clip(); // keep the readouts inside the frame
    for (const t of terms) {
      t.hidden = underPage(t.box); if (t.hidden) continue;
      cx.font = `400 ${t.fs}px "Martian Mono", ui-monospace, monospace`; cx.textBaseline = "top";
      const full = t.lines.join("\n");
      if (still) t.pos = full.length;
      else if (t.scramble > 0) { t.scramble -= dt; if (t.scramble <= 0) newScript(t, false); }
      else if (t.pos < full.length) t.pos = Math.min(full.length, t.pos + dt * t.speed * (full[Math.floor(t.pos)] === "." ? 2.6 : 1));
      else { t.hold += dt; if (t.hold > t.holdFor) t.scramble = .4 + Math.random() * .3; }
      let shown = full.slice(0, Math.floor(t.pos));
      if (t.scramble > 0) shown = [...shown].map(ch => ch === "\n" || ch === " " || Math.random() > .55 ? ch : GLYPHS[R(0, GLYPHS.length - 1)]).join("");
      const lines = shown.split("\n"), a = (C.dark ? .28 : .42) * st.text, hi = (C.dark ? .55 : .75) * Math.min(1, st.text);
      lines.forEach((ln, k) => {
        const y = t.y + k * t.lh;
        cx.fillStyle = rgba(C.text, a); cx.fillText(ln, t.x, y);
        const m = ln.match(/(OK|RETRY|SKIP|HELD)$/);
        if (m && t.scramble <= 0) { cx.fillStyle = rgba(m[1] === "OK" ? C.hi : C.text, hi); cx.fillText(m[1], t.x + cx.measureText(ln.slice(0, -m[1].length)).width, y); }
      });
      if (!still && t.scramble <= 0 && Math.floor(performance.now() / 380) % 2) {
        const last = lines[lines.length - 1] || "";
        cx.fillStyle = rgba(C.hi, .6 * Math.min(1, st.text));
        cx.fillRect(t.x + cx.measureText(last).width + 3, t.y + (lines.length - 1) * t.lh, t.fs * .7, t.fs * 1.1);
      }
    }
    cx.restore();
  }
  function frame(dt, still) {
    cx.clearRect(0, 0, W, H);
    const st = STRENGTH[S.level];
    drawGrid(st);
    drawGeo(dt, st, still);
    drawRails();
    drawTerms(dt, st, still);
  }

  // ---------- run at ~20 fps; pause in background tabs; stand still for reduced motion ----------
  let last = 0, acc = 0, raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(.1, (now - (last || now)) / 1000); last = now; acc += dt;
    if (acc < 1 / 20) return;
    const step = acc; acc = 0; clock += step;
    frame(step, false);
  }
  const still = () => frame(0, true);
  function start() {
    cancelAnimationFrame(raf); last = 0;
    if (reduce.matches) { still(); return; }
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  addEventListener("resize", () => { layout(); if (reduce.matches) still(); });
  reduce.addEventListener?.("change", start);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readColors(); buildGeometry(); if (reduce.matches) still(); });

  // ---------- for js/app.js ----------
  window.LedgerBackdrop = {
    setDecks(names) {
      const list = (names || []).map(n => String(n).toUpperCase().replace(/[^A-Z0-9 ,'-]/g, "").trim()).filter(Boolean);
      if (list.length && list.join("|") !== DECKS.join("|")) DECKS = list.slice(0, 40);
      if (reduce.matches && grid) still(); // the page changed: redraw the still frame so nothing sits under new text
    },
    refresh() { readColors(); if (grid) buildGeometry(); if (reduce.matches) still(); },
  };
  readColors(); layout();
  document.fonts && document.fonts.ready.then(() => { terms.forEach(t => { const pos = t.pos; newScript(t, true); t.pos = Math.min(pos, t.lines.join("\n").length); }); if (reduce.matches) still(); });
  // an explicit light/dark choice changes the colours too (the site calls refresh(); this catches the device setting)
  start();
})();
