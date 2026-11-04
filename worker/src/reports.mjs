// Error reports from the site, kept in a small SQLite database inside a Durable Object (part of
// Cloudflare's free plan, so nothing extra to set up). A report holds the error message, where it
// happened, the browser, whether it's the installed app or signed in, and the site version: never deck
// contents, names or emails. The same error on the same day shares one record with a count. Only the
// repo's own GitHub workflow can read them, proved with GitHub's signed OIDC token (no password to keep).
import { DurableObject } from "cloudflare:workers";

const KEEP_DAYS = 30, KEEP_MAX = 2000, PER_HOUR = 30;

export class Reports extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reports (key TEXT PRIMARY KEY, kind TEXT, message TEXT, place TEXT, view TEXT, browser TEXT,
      app INTEGER, signed INTEGER, version TEXT, first TEXT, last TEXT, count INTEGER, sent INTEGER DEFAULT 0, t INTEGER)`);
    this.hits = new Map(); // visitor -> [hour, count], only to stop one visitor flooding the list; not stored
  }
  async add(r, key, who) {
    const hour = Math.floor(Date.now() / 3600000); const h = this.hits.get(who);
    if (h && h[0] === hour && h[1] >= PER_HOUR) return false;
    this.hits.set(who, h && h[0] === hour ? [hour, h[1] + 1] : [hour, 1]);
    if (this.hits.size > 5000) this.hits.clear();
    const now = new Date().toISOString(); const t = Date.now();
    this.sql.exec(`INSERT INTO reports (key, kind, message, place, view, browser, app, signed, version, first, last, count, sent, t)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1, last = excluded.last, sent = 0, t = excluded.t`,
      key, r.kind, r.message, r.where, r.view, r.browser, r.app ? 1 : 0, r.signedIn ? 1 : 0, r.version, now, now, t);
    this.sql.exec(`DELETE FROM reports WHERE t < ?`, t - KEEP_DAYS * 86400000);
    this.sql.exec(`DELETE FROM reports WHERE key IN (SELECT key FROM reports ORDER BY t DESC LIMIT -1 OFFSET ?)`, KEEP_MAX);
    return true;
  }
  async unsent() {
    return this.sql.exec(`SELECT key, kind, message, place AS "where", view, browser, app, signed AS signedIn, version, first, last, count FROM reports WHERE sent = 0 ORDER BY count DESC, t DESC LIMIT 500`).toArray();
  }
  async markSent(keys) {
    for (const k of (Array.isArray(keys) ? keys : []).slice(0, 1000)) this.sql.exec(`UPDATE reports SET sent = 1 WHERE key = ?`, String(k));
    return true;
  }
}

// ---------- is this request really from the repo's own GitHub workflow? ----------
const ISSUER = "https://token.actions.githubusercontent.com";
const b64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let jwks = null, jwksAt = 0;
export async function fromRepoWorkflow(request, repo, audience) {
  try {
    const parts = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== "RS256" || claims.iss !== ISSUER || claims.aud !== audience || claims.repository !== repo || !(claims.exp > now)) return false;
    if (!jwks || Date.now() - jwksAt > 3600000) { const r = await fetch(ISSUER + "/.well-known/jwks"); if (!r.ok) return false; jwks = await r.json(); jwksAt = Date.now(); }
    const jwk = (jwks.keys || []).find(k => k.kid === header.kid); if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  } catch { return false; }
}
