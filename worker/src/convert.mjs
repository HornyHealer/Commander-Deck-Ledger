// Turns Archidekt's deck data into the plain-text list the ledger already understands:
// "1x Card Name [Commander]" for commanders first, then "Nx Card Name" for the rest.
// Maybeboard, sideboard and any other category Archidekt marks as not in the deck are left out.

export function parseDeckId(input) {
  const s = String(input || "").trim();
  const m = s.match(/archidekt\.com\/(?:api\/)?decks\/(\d+)/i);
  if (m) return m[1];
  if (/^\d{1,12}$/.test(s)) return s;
  return "";
}

const catName = c => (typeof c === "string" ? c : c && c.name) || "";

export function deckToText(data) {
  const notInDeck = new Set((data && Array.isArray(data.categories) ? data.categories : [])
    .filter(c => c && c.includedInDeck === false).map(c => c.name));
  const premier = new Set((data && Array.isArray(data.categories) ? data.categories : [])
    .filter(c => c && c.isPremier && /commander/i.test(c.name || "")).map(c => c.name));
  const byName = new Map();
  for (const e of (data && Array.isArray(data.cards) ? data.cards : [])) {
    const card = (e && e.card) || {};
    const name = (card.oracleCard && card.oracleCard.name) || card.name || (e && e.name) || "";
    if (!name) continue;
    const cats = (e.categories || []).map(catName).filter(Boolean);
    if (cats.some(c => notInDeck.has(c) || /^(maybeboard|sideboard|considering)$/i.test(c))) continue;
    const q = Math.max(1, parseInt(e.quantity, 10) || 1);
    const cmd = cats.some(c => /^commanders?$/i.test(c) || premier.has(c));
    const row = byName.get(name) || { name, q: 0, cmd: false };
    row.q += q; row.cmd = row.cmd || cmd; byName.set(name, row);
  }
  const rows = [...byName.values()];
  const cmds = rows.filter(r => r.cmd);
  const rest = rows.filter(r => !r.cmd).sort((a, b) => a.name.localeCompare(b.name));
  const lines = [...cmds.map(r => `${r.q}x ${r.name} [Commander]`), ...rest.map(r => `${r.q}x ${r.name}`)];
  return {
    name: (data && data.name) || "",
    text: lines.join("\n"),
    count: rows.reduce((a, r) => a + r.q, 0),
    commanders: cmds.map(r => r.name),
  };
}
