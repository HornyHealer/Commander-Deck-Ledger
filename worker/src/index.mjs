// Cloudflare Worker: fetches a public Archidekt deck for the Commander Deck Ledger and returns it as a
// plain-text list. Browsers can't read Archidekt's deck data from another site directly, so this does it.
// It only accepts Archidekt deck links or IDs, and only answers pages from the ledger's own address.
import { deckToText, parseDeckId } from "./convert.mjs";

const ALLOWED = ["https://hornyhealer.github.io", "http://127.0.0.1:4173", "http://localhost:4173"];
const UA = "CommanderDeckLedger/1.0 (+https://hornyhealer.github.io/Commander-Deck-Ledger/)";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const ok = ALLOWED.includes(origin);
    const cors = ok ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" },
    });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (request.method !== "GET") return reply(405, { error: "method" });
    if (!ok) return reply(403, { error: "origin" });

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
