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

// ---------- combos (Commander Spellbook) ----------
// Cleans the deck the site sends: { commanders: [names], main: [{ card, quantity }] }.
export function cleanDeck(body) {
  const name = s => (typeof s === "string" ? s.trim().slice(0, 200) : "");
  const commanders = (Array.isArray(body && body.commanders) ? body.commanders : []).map(c => name(typeof c === "string" ? c : c && c.card)).filter(Boolean).slice(0, 4);
  const main = (Array.isArray(body && body.main) ? body.main : []).map(c => ({ card: name(c && c.card), quantity: Math.min(99, Math.max(1, parseInt(c && c.quantity, 10) || 1)) })).filter(c => c.card).slice(0, 250);
  return { commanders: commanders.map(card => ({ card, quantity: 1 })), main };
}

// Keeps only what the ledger shows from Commander Spellbook's find-my-combos answer.
export function trimCombos(data, deck) {
  const have = new Set();
  for (const c of [...(deck.commanders || []), ...(deck.main || [])]) { const n = c.card.toLowerCase(); have.add(n); have.add(n.split(" // ")[0]); }
  const owned = n => have.has(n.toLowerCase()) || have.has(n.split(" // ")[0].toLowerCase());
  const r = (data && data.results) || {};
  const one = v => {
    const cards = (v.uses || []).map(u => (u.card && u.card.name) || "").filter(Boolean);
    const templates = (v.requires || []).map(t => (t.template && t.template.name) || "").filter(Boolean);
    const produces = (v.produces || []).map(p => (p.feature && p.feature.name) || "").filter(Boolean);
    const prereq = [v.easyPrerequisites, v.notablePrerequisites, v.otherPrerequisites].filter(Boolean).join("\n");
    return { id: String(v.id || ""), cards, templates, produces, steps: String(v.description || ""), prereq, mana: String(v.manaNeeded || ""), bracketTag: v.bracketTag || "", popularity: v.popularity || 0, twoCard: cards.length === 2 && !templates.length };
  };
  const byPop = (a, b) => (b.popularity || 0) - (a.popularity || 0);
  const included = (Array.isArray(r.included) ? r.included : []).map(one).sort((a, b) => a.cards.length - b.cards.length || byPop(a, b));
  const allAlmost = Array.isArray(r.almostIncluded) ? r.almostIncluded : [];
  const almost = allAlmost.map(one).map(c => ({ ...c, missing: c.cards.filter(n => !owned(n)) })).sort(byPop).slice(0, 40);
  return { included, almost, almostTotal: allAlmost.length };
}
