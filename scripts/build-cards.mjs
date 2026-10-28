// Builds data/cards.json from Scryfall's "Oracle Cards" bulk data (one entry per card).
// Runs weekly on GitHub Actions; can also be run by hand with `node scripts/build-cards.mjs`.
//
// Each card is stored as a compact array so the file stays small:
//   [name, manaCost, typeCode, colorIdentity, flags, oracleId, pairCode, copyLimit?]
//   manaCost   "2 W U", hybrids as "G/U", split cards as "1 R // 1 U"
//   typeCode   C creature, P planeswalker, B battle, L land, I instant, S sorcery, A artifact, E enchantment, O other
//   flags      1 can be a commander, 2 banned in Commander, 4 Game Changer, 8 not legal in Commander,
//              16 extra turns, 32 mass land denial, and suggested roles: 64 ramp, 128 draw, 256 removal,
//              512 board wipe, 1024 tutor (read from the card's text by js/card-rules.js)
//   oracleId   Scryfall's permanent ID for the card (the same across every printing and any rename)
//   pairCode   how it pairs as a second commander: P partner, PW:<name> partner with, PV:<kind> partner variant,
//              FF friends forever, CB choose a Background, BG is a Background, DC Doctor's companion, TD Time Lord Doctor
//   copyLimit  -1 any number of copies allowed, N up to N copies; left out for normal singleton cards
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// The text-reading rules are shared with the website, so lookups made in the browser match this list.
const rules = createRequire(import.meta.url)('../js/card-rules.js');
export const FLAG = rules.FLAG;
export const { pairCode, copyLimit, textFlags } = rules;
const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'scheme', 'planar', 'augment', 'host']);
const TYPE_CODES = [['Creature', 'C'], ['Planeswalker', 'P'], ['Battle', 'B'], ['Land', 'L'], ['Instant', 'I'], ['Sorcery', 'S'], ['Artifact', 'A'], ['Enchantment', 'E']];

export const cost = s => String(s || '').split(' // ').map(face => (face.match(/\{([^}]+)\}/g) || []).map(x => x.slice(1, -1)).join(' ')).join(' // ');

export function typeCode(typeLine) {
  const words = String(typeLine || '').split(' // ')[0].split(/[\s—-]+/);
  for (const [w, code] of TYPE_CODES) if (words.includes(w)) return code;
  return 'O';
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
  const code = typeCode(typeLine);
  flags |= textFlags(text, code);
  const ci = 'WUBRG'.split('').filter(x => (c.color_identity || []).includes(x)).join('');
  const rec = [name, cost(manaCost), code, ci, flags, c.oracle_id || '', pairCode(text, frontType)];
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

// Finds the bulk file's address in Scryfall's response. Older responses used "download_uri";
// this also accepts other field names or a list of files, preferring uncompressed JSON.
export function findDownloadUrl(info) {
  if (!info || typeof info !== 'object') return '';
  if (typeof info.download_uri === 'string') return info.download_uri;
  if (typeof info.jsonl_download_uri === 'string') return info.jsonl_download_uri;
  const found = [];
  const walk = v => {
    if (typeof v === 'string') { if (/^https:\/\/[^\s]+\.jsonl?(\.gz)?(\?.*)?$/i.test(v) && !/api\.scryfall\.com\/bulk-data/i.test(v)) found.push(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(info);
  return found.find(u => !/\.gz(\?|$)/i.test(u)) || found[0] || '';
}

// Accepts a JSON array or JSON Lines (one card object per line).
export function parseCards(text) {
  const s = text.trimStart();
  if (s.startsWith('[')) return JSON.parse(s);
  return s.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
}

const HEADERS = { 'User-Agent': 'CommanderDeckLedger/1.0 (+https://github.com/HornyHealer/Commander-Deck-Ledger)', Accept: 'application/json' };

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const info = await (await fetch('https://api.scryfall.com/bulk-data/oracle-cards', { headers: HEADERS })).json();
  const url = findDownloadUrl(info);
  if (!url) throw new Error('Scryfall did not return a download link. Fields: ' + Object.keys(info).join(', ') + ' ' + JSON.stringify(info).slice(300, 900));
  console.log(`Downloading ${url} (updated ${info.updated_at})`);
  const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'], Accept: '*/*' } });
  if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf); // compressed file
  const cards = parseCards(buf.toString('utf8'));
  console.log(`Read ${cards.length} Scryfall entries`);
  const list = transform(cards);
  const problems = sanityCheck(list);
  if (problems.length) throw new Error('Card list looks wrong, not saving it: ' + problems.join('; '));
  const out = path.join(root, 'data', 'cards.json');
  const json = JSON.stringify(list);
  const before = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (before === json) { console.log(`::notice title=Card list::No changes (${list.length} cards).`); return; }
  writeFileSync(out, json);
  writeFileSync(path.join(root, 'data', 'cards-meta.json'), JSON.stringify({ source: 'Scryfall Oracle Cards', scryfallUpdated: info.updated_at, built: new Date().toISOString(), count: list.length }, null, 1) + '\n');
  const counts = { banned: list.filter(r => r[4] & FLAG.BANNED).length, gameChangers: list.filter(r => r[4] & FLAG.GAME_CHANGER).length, commanders: list.filter(r => r[4] & FLAG.COMMANDER).length };
  console.log(`Saved ${list.length} cards`, counts);
  console.log(`::notice title=Card list::Saved ${list.length} cards from Scryfall (${counts.banned} banned, ${counts.gameChangers} Game Changers, ${counts.commanders} possible commanders).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // "::error::" and "::notice::" lines show up as annotations on the GitHub run.
  const oneLine = s => String(s).replace(/\r?\n/g, ' ').slice(0, 900);
  main().catch(err => { console.error(err); console.log(`::error title=Card list build failed::${oneLine(err && err.stack || err)}`); process.exit(1); });
}
