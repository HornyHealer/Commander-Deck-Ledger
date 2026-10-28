// Builds data/cards.json from Scryfall's "Oracle Cards" bulk data (one entry per card).
// Runs weekly on GitHub Actions; can also be run by hand with `node scripts/build-cards.mjs`.
//
// Each card is stored as a compact array so the file stays small:
//   [name, manaCost, typeCode, colorIdentity, flags, oracleId, pairCode, copyLimit?]
//   manaCost   "2 W U", hybrids as "G/U", split cards as "1 R // 1 U"
//   typeCode   C creature, P planeswalker, B battle, L land, I instant, S sorcery, A artifact, E enchantment, O other
//   flags      1 can be a commander, 2 banned in Commander, 4 Game Changer, 8 not legal in Commander
//   oracleId   Scryfall's permanent ID for the card (the same across every printing and any rename)
//   pairCode   how it pairs as a second commander: P partner, PW:<name> partner with, PV:<kind> partner variant,
//              FF friends forever, CB choose a Background, BG is a Background, DC Doctor's companion, TD Time Lord Doctor
//   copyLimit  -1 any number of copies allowed, N up to N copies; left out for normal singleton cards
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FLAG = { COMMANDER: 1, BANNED: 2, GAME_CHANGER: 4, NOT_LEGAL: 8 };
const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'scheme', 'planar', 'augment', 'host']);
const TYPE_CODES = [['Creature', 'C'], ['Planeswalker', 'P'], ['Battle', 'B'], ['Land', 'L'], ['Instant', 'I'], ['Sorcery', 'S'], ['Artifact', 'A'], ['Enchantment', 'E']];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 };

export const cost = s => String(s || '').split(' // ').map(face => (face.match(/\{([^}]+)\}/g) || []).map(x => x.slice(1, -1)).join(' ')).join(' // ');

export function typeCode(typeLine) {
  const words = String(typeLine || '').split(' // ')[0].split(/[\s—-]+/);
  for (const [w, code] of TYPE_CODES) if (words.includes(w)) return code;
  return 'O';
}

export function pairCode(text, typeLine) {
  const t = String(text || '');
  let m;
  if ((m = t.match(/\bPartner with ([^\n(]+?)\s*(?:\(|$)/m))) return 'PW:' + m[1].trim();
  if ((m = t.match(/^Partner\s*[—-]\s*([^\n(]+?)\s*(?:\(|$)/m))) return 'PV:' + m[1].trim();
  if (/^Partner\s*(?:\(|$)/m.test(t)) return 'P';
  if (/^Friends forever\b/m.test(t)) return 'FF';
  if (/\bChoose a Background\b/i.test(t)) return 'CB';
  if (/\bDoctor's companion\b/i.test(t)) return 'DC';
  const tl = String(typeLine || '');
  if (/\bBackground\b/.test(tl.split(' // ')[0])) return 'BG';
  if (/\bTime Lord Doctor\b/.test(tl)) return 'TD';
  return '';
}

export function copyLimit(text) {
  const t = String(text || '');
  if (/A deck can have any number of cards named/i.test(t)) return -1;
  const m = t.match(/A deck can have up to (\w+) cards named/i);
  if (m) return NUMBER_WORDS[m[1].toLowerCase()] || parseInt(m[1], 10) || 0;
  return 0;
}

export function toRecord(c) {
  if (!c || !c.name || SKIP_LAYOUTS.has(c.layout)) return null;
  if (c.set_type === 'memorabilia' || c.set_type === 'token') return null;
  if (/^A-/.test(c.name)) return null; // digital-only rebalanced versions
  const faces = Array.isArray(c.card_faces) ? c.card_faces : [];
  let name = c.name;
  const parts = name.split(' // ');
  if (parts.length === 2 && parts[0] === parts[1]) name = parts[0]; // reversible cards repeat the name
  const manaCost = c.layout === 'split' && faces.length ? faces.map(f => f.mana_cost || '').join(' // ')
    : (faces.length && faces[0].mana_cost !== undefined ? faces[0].mana_cost : c.mana_cost);
  const typeLine = c.type_line || (faces[0] && faces[0].type_line) || '';
  const frontType = faces.length && faces[0].type_line ? faces[0].type_line : typeLine.split(' // ')[0];
  const text = [c.oracle_text, ...faces.map(f => f.oracle_text)].filter(Boolean).join('\n');
  const frontWords = frontType.split(/[\s—-]+/);
  const legal = (c.legalities || {}).commander;
  let flags = 0;
  if ((frontWords.includes('Legendary') && frontWords.includes('Creature')) || /can be your commander/i.test(text)) flags |= FLAG.COMMANDER;
  if (legal === 'banned') flags |= FLAG.BANNED;
  if (legal === 'not_legal') flags |= FLAG.NOT_LEGAL;
  if (c.game_changer === true) flags |= FLAG.GAME_CHANGER;
  const ci = 'WUBRG'.split('').filter(x => (c.color_identity || []).includes(x)).join('');
  const rec = [name, cost(manaCost), typeCode(typeLine), ci, flags, c.oracle_id || '', pairCode(text, frontType)];
  const limit = copyLimit(text);
  if (limit) rec.push(limit);
  return rec;
}

export function transform(cards) {
  const byName = new Map();
  for (const c of cards) {
    const r = toRecord(c);
    if (!r) continue;
    const prev = byName.get(r[0]);
    // If two entries share a name, keep the one that is legal in Commander.
    if (!prev || ((prev[4] & FLAG.NOT_LEGAL) && !(r[4] & FLAG.NOT_LEGAL))) byName.set(r[0], r);
  }
  return [...byName.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function sanityCheck(list) {
  const problems = [];
  if (list.length < 25000) problems.push(`only ${list.length} cards`);
  for (const must of ['Sol Ring', 'Command Tower', 'Lightning Bolt']) if (!list.some(r => r[0] === must)) problems.push(`missing ${must}`);
  const withId = list.filter(r => r[5]).length;
  if (withId < list.length * 0.99) problems.push(`only ${withId} of ${list.length} cards have IDs`);
  if (!list.some(r => r[4] & FLAG.BANNED)) problems.push('no banned cards found');
  return problems;
}

const HEADERS = { 'User-Agent': 'CommanderDeckLedger/1.0 (+https://github.com/HornyHealer/Commander-Deck-Ledger)', Accept: 'application/json' };

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const info = await (await fetch('https://api.scryfall.com/bulk-data/oracle-cards', { headers: HEADERS })).json();
  if (!info.download_uri) throw new Error('Scryfall did not return a download link: ' + JSON.stringify(info).slice(0, 300));
  console.log(`Downloading ${info.download_uri} (updated ${info.updated_at})`);
  const res = await fetch(info.download_uri, { headers: HEADERS });
  if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);
  const cards = JSON.parse(await res.text());
  const list = transform(cards);
  const problems = sanityCheck(list);
  if (problems.length) throw new Error('Card list looks wrong, not saving it: ' + problems.join('; '));
  const out = path.join(root, 'data', 'cards.json');
  const json = JSON.stringify(list);
  const before = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (before === json) { console.log(`No changes (${list.length} cards).`); return; }
  writeFileSync(out, json);
  writeFileSync(path.join(root, 'data', 'cards-meta.json'), JSON.stringify({ source: 'Scryfall Oracle Cards', scryfallUpdated: info.updated_at, built: new Date().toISOString(), count: list.length }, null, 1) + '\n');
  const counts = { banned: list.filter(r => r[4] & FLAG.BANNED).length, gameChangers: list.filter(r => r[4] & FLAG.GAME_CHANGER).length, commanders: list.filter(r => r[4] & FLAG.COMMANDER).length };
  console.log(`Saved ${list.length} cards`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
