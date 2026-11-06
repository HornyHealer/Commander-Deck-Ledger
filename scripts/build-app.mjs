// Builds js/app.js from the files in js/src/ (joined in name order inside one function, so they share one
// scope exactly as when the app was a single file). js/app.js is generated: edit js/src/ instead.
//   node scripts/build-app.mjs          build
//   node scripts/build-app.mjs --check  fail if js/app.js isn't up to date (not needed in normal use)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'js', 'src'), out = path.join(root, 'js', 'app.js');

export function build() {
  const files = readdirSync(src).filter(f => f.endsWith('.js')).sort();
  if (!files.length) throw new Error('No files in js/src');
  const body = files.map(f => readFileSync(path.join(src, f), 'utf8').replace(/\s+$/, '')).join('\n\n');
  return '// GENERATED from js/src/ by scripts/build-app.mjs. Edit those files, not this one.\n(() => {\n"use strict";\n' + body + '\n})();\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = build();
  if (process.argv.includes('--check')) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) { console.error('js/app.js is out of date: run node scripts/build-app.mjs'); process.exit(1); }
    console.log('js/app.js is up to date');
  } else {
    writeFileSync(out, text);
    console.log(`Built js/app.js from ${readdirSync(src).filter(f => f.endsWith('.js')).length} files (${text.split('\n').length} lines)`);
  }
}
