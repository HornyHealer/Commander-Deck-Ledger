// Cloudflare Worker: fetches a public Archidekt deck for the Commander Deck Ledger and returns it as a
// plain-text list. Browsers can't read Archidekt's deck data from another site directly, so this does it.
// It only accepts Archidekt deck links or IDs, and only answers pages from the ledger's own address.
// POST /combos sends a deck list to Commander Spellbook (commanderspellbook.com) and returns its combos.
// POST /report keeps a short error report from the site (see src/reports.mjs). GET /reports/new and
// POST /reports/sent are for the repo's daily GitHub workflow only, checked with GitHub's signed token.
import { deckToText, parseDeckId, cleanDeck, trimCombos, cleanReport, reportKey } from "./convert.mjs";
import { Reports, fromRepoWorkflow } from "./reports.mjs";
export { Reports };
const REPO = "HornyHealer/Commander-Deck-Ledger";

const ALLOWED = ["https://hornyhealer.github.io", "http://127.0.0.1:4173", "http://localhost:4173"];
const UA = "CommanderDeckLedger/1.0 (+https://hornyhealer.github.io/Commander-Deck-Ledger/)";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const box = () => env.REPORTS.get(env.REPORTS.idFromName("all"));
    // The daily workflow collects new reports (it isn't a browser, so it sends no Origin).
    if (path === "/reports/new" || path === "/reports/sent") {
      const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      if (!(await fromRepoWorkflow(request, REPO, "cdl-reports"))) return json(401, { error: "not-allowed" });
      if (path === "/reports/new" && request.method === "GET") return json(200, { reports: await box().unsent() });
      if (path === "/reports/sent" && request.method === "POST") { const b = await request.json().catch(() => ({})); await box().markSent(b.keys); return json(200, { ok: true }); }
      return json(405, { error: "method" });
    }
    const origin = request.headers.get("Origin") || "";
    const ok = ALLOWED.includes(origin);
    const cors = ok ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" },
    });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
    if (!ok) return reply(403, { error: "origin" });

    if (path === "/report") {
      if (request.method !== "POST") return reply(405, { error: "method" });
      const text = await request.text(); if (text.length > 4000) return reply(413, { error: "too-big" });
      let body; try { body = JSON.parse(text); } catch { return reply(400, { error: "bad-report" }); }
      if (body && body.test) return reply(200, { ok: true, ready: !!(env && env.REPORTS) }); // deploy check, nothing stored
      const r = cleanReport(body); if (!r) return reply(400, { error: "bad-report" });
      const who = request.headers.get("CF-Connecting-IP") || "?"; // only to stop floods; never stored
      await box().add(r, reportKey(r, new Date().toISOString().slice(0, 10)), who);
      return reply(200, { ok: true });
    }

    if (path === "/combos") {
      if (request.method !== "POST") return reply(405, { error: "method" });
      let body; try { body = await request.json(); } catch { return reply(400, { error: "bad-list" }); }
      const deck = cleanDeck(body);
      if (!deck.main.length && !deck.commanders.length) return reply(400, { error: "bad-list" });
      let res;
      try {
        res = await fetch("https://backend.commanderspellbook.com/find-my-combos/", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA }, body: JSON.stringify(deck) });
      } catch { return reply(502, { error: "upstream" }); }
      if (res.status === 429) return reply(429, { error: "busy" });
      if (!res.ok) return reply(502, { error: "upstream", status: res.status });
      let data; try { data = await res.json(); } catch { return reply(502, { error: "format" }); }
      return reply(200, trimCombos(data, deck));
    }

    if (request.method !== "GET") return reply(405, { error: "method" });

    const id = parseDeckId(new URL(request.url).searchParams.get("deck"));
    if (!id) return reply(400, { error: "bad-link" });

    let res;
    try {
      res = await fetch(`https://archidekt.com/api/decks/${id}/`, { headers: { "User-Agent": UA, Accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
    } catch { return reply(502, { error: "upstream" }); }
    if (res.status === 404) return reply(404, { error: "not-found" });
    if (res.status === 401 || res.status === 403) return reply(403, { error: "private" });
    if (!res.ok) return reply(502, { error: "upstream", status: res.status });

    let data;
    try { data = await res.json(); } catch { return reply(502, { error: "format" }); }
    const out = deckToText(data);
    if (!out.count) return reply(422, { error: "empty", name: out.name });
    return reply(200, { id, ...out });
  },
};
