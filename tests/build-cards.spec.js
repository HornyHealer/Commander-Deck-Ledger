// Checks the Scryfall-to-card-list conversion on a small sample of real-shaped Scryfall data.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scryfall-sample.json'), 'utf8'));
let m;
test.beforeAll(async () => { m = await import('../scripts/build-cards.mjs'); });
const byName = list => Object.fromEntries(list.map(r => [r[0], r]));

test('converts Scryfall cards into compact records', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const cards = byName(m.transform(sample));
  expect(cards['Sol Ring']).toEqual(['Sol Ring', '1', 'A', '', m.FLAG.GAME_CHANGER | m.FLAG.RAMP, '6ad8011d-3471-4369-9d68-b264cc027487', '']);
  expect(cards['Fire // Ice'].slice(1, 4)).toEqual(['1 R // 1 U', 'I', 'UR']);
  expect(cards['Delver of Secrets // Insectile Aberration'].slice(1, 3)).toEqual(['U', 'C']);
  expect(cards['Bonecrusher Giant // Stomp'].slice(1, 3)).toEqual(['2 R', 'C']);
  expect(cards['Kitchen Finks'][1]).toBe('1 G/W G/W');
});

test('skips tokens and digital-only rebalanced cards', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const names = m.transform(sample).map(r => r[0]);
  expect(names).not.toContain('Goblin Token');
  expect(names).not.toContain('A-Cosmos Elixir');
  expect(names).toEqual([...names].sort());
});

test('records commander eligibility, legality and pairing', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const cards = byName(m.transform(sample));
  const F = m.FLAG;
  expect(cards['Thrasios, Triton Hero'][4] & F.COMMANDER).toBeTruthy();
  expect(cards['Thrasios, Triton Hero'][6]).toBe('P');
  expect(cards['Pir, Imaginative Rascal'][6]).toBe('PW:Toothy, Imaginary Friend');
  expect(cards['Wilson, Refined Grizzly'][6]).toBe('CB');
  expect(cards['Raised by Giants'][6]).toBe('BG');
  expect(cards['Raised by Giants'][4] & F.COMMANDER).toBeFalsy();
  expect(cards['Grist, the Hunger Tide'][4] & F.COMMANDER).toBeTruthy();
  expect(cards['Primeval Titan'][4] & F.BANNED).toBeTruthy();
  expect(cards['Blacker Lotus'][4] & F.NOT_LEGAL).toBeTruthy();
  expect(cards['Lightning Bolt'][4]).toBe(m.FLAG.REMOVAL);
});

test('records how many copies a deck may run', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const cards = byName(m.transform(sample));
  expect(cards['Relentless Rats'][7]).toBe(-1);
  expect(cards['Seven Dwarves'][7]).toBe(7);
  expect(cards['Lightning Bolt'].length).toBe(7);
});

test('refuses to save a list that looks broken', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  expect(m.sanityCheck(m.transform(sample)).join(' ')).toContain('only');
});

test('finds the download link in old and new Scryfall responses', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  expect(m.findDownloadUrl({ download_uri: 'https://data.scryfall.io/oracle-cards/x.json' })).toBe('https://data.scryfall.io/oracle-cards/x.json');
  expect(m.findDownloadUrl({ object: 'bulk_data', uri: 'https://api.scryfall.com/bulk-data/abc', files: [{ url: 'https://data.scryfall.io/oracle-cards/x.json.gz' }, { url: 'https://data.scryfall.io/oracle-cards/x.json' }] })).toBe('https://data.scryfall.io/oracle-cards/x.json');
  expect(m.findDownloadUrl({ object: 'bulk_data', uri: 'https://api.scryfall.com/bulk-data/abc' })).toBe('');
});

test('reads Scryfall files as a JSON array or JSON Lines', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  expect(m.findDownloadUrl({ jsonl_download_uri: 'https://data.scryfall.io/oracle-cards/x.jsonl.gz' })).toBe('https://data.scryfall.io/oracle-cards/x.jsonl.gz');
  const a = m.parseCards(JSON.stringify(sample));
  const b = m.parseCards(sample.map(c => JSON.stringify(c)).join('\n') + '\n');
  expect(b).toEqual(a);
});

test('reads extra turns, mass land denial and suggested roles from the card text', async ({}, info) => {
  test.skip(info.project.name !== 'desktop');
  const F = m.FLAG;
  const has = (text, code = 'S') => Object.keys(F).filter(k => m.textFlags(text, code) & F[k]);
  expect(has('Target player takes an extra turn after this one.')).toEqual(['EXTRA_TURN']);
  expect(has('If an opponent would begin an extra turn, that player skips that turn instead.', 'E')).toEqual([]);
  expect(has('Destroy all lands.')).toEqual(['LAND_DENIAL']);
  expect(has('Nonbasic lands are Mountains.', 'E')).toEqual(['LAND_DENIAL']);
  expect(has("As long as Winter Orb is untapped, players can't untap more than one land during their untap steps.", 'A')).toEqual(['LAND_DENIAL']);
  expect(has('{T}, Sacrifice Strip Mine: Destroy target land.', 'L')).toEqual([]);
  expect(has('Destroy all creatures. They can\'t be regenerated.')).toEqual(['WIPE']);
  expect(has('Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.')).toEqual(['RAMP']);
  expect(has('{T}: Add {C}.', 'L')).toEqual([]);
  expect(has('Draw three cards, then put two cards from your hand on top of your library.', 'I')).toEqual(['DRAW']);
  expect(has('Search your library for a card, put that card into your hand, then shuffle.')).toEqual(['TUTOR']);
  expect(has('Exile target creature. Its controller gains life equal to its power.', 'I')).toEqual(['REMOVAL']);
  expect(has('Counter target spell.', 'I')).toEqual(['REMOVAL']);
  // Reminder text in parentheses is ignored.
  expect(has('Flying (This creature can\'t be blocked except by creatures with flying or reach. Draw a card.)', 'C')).toEqual([]);
});
