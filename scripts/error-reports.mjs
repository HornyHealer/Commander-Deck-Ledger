// Part of the daily health check: collects error reports the site has sent to the Cloudflare Worker,
// posts any new ones as a comment on the "Error reports" GitHub issue (GitHub emails you), then marks them
// as posted. Quiet days post nothing. The Worker only answers this repo's own workflow: the run proves who
// it is with GitHub's signed OIDC token (needs "id-token: write"), so there's no password to keep.
import { execFileSync } from 'node:child_process';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const LABEL = 'error-report';
const WORKER = 'https://cdl-archidekt.deckledger.workers.dev';

async function githubProof() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) throw new Error('no GitHub OIDC token (the workflow needs "id-token: write")');
  const r = await fetch(url + '&audience=cdl-reports', { headers: { Authorization: 'bearer ' + tok } });
  if (!r.ok) throw new Error('GitHub OIDC token request failed: HTTP ' + r.status);
  return (await r.json()).value;
}

function browserOf(ua) {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'other';
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'other';
  return `${b} on ${os}`;
}
const cell = s => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 220);

async function main() {
  const auth = { Authorization: 'Bearer ' + await githubProof() };
  const res = await fetch(WORKER + '/reports/new', { headers: auth });
  if (!res.ok) { console.log('::warning title=Error reports::The Worker refused or failed: HTTP ' + res.status); return; }
  const recs = (await res.json()).reports || [];
  if (!recs.length) { console.log('::notice title=Error reports::No new error reports.'); return; }
  recs.sort((a, b) => (b.count || 1) - (a.count || 1));
  const rows = recs.map(r => `| ${r.count || 1} | ${cell(r.kind)} | ${cell(r.message)} | ${cell(r.where)} | ${cell(r.view)} | ${cell(browserOf(r.browser || ''))}${r.app ? ' (installed app)' : ''} | ${r.signedIn ? 'yes' : 'no'} | ${cell((r.first || '').slice(0, 16).replace('T', ' '))} | ${cell(r.version)} |`);
  const total = recs.reduce((a, r) => a + (r.count || 1), 0);
  const body = `**${recs.length} new error${recs.length === 1 ? '' : 's'}** (${total} report${total === 1 ? '' : 's'}) since the last check:\n\n| Times | Kind | Message | Where | Page | Browser | Signed in | First seen (UTC) | Site version |\n|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\nReports hold no deck contents, names or emails. Paste this into the chat with Claude to look into them.`;
  try { gh('label', 'create', LABEL, '--color', 'FBCA04', '--description', 'Errors reported by the site', '--force'); } catch {}
  const open = JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '1'));
  if (open.length) gh('issue', 'comment', String(open[0].number), '--body', body);
  else gh('issue', 'create', '--title', 'Error reports from the site', '--label', LABEL, '--body', 'When something goes wrong in someone\'s browser, the site sends a short report (the error message, the page, the browser and phone, the time; no deck contents, names or emails). The daily health check posts new ones here as comments.\n\nClose this issue whenever you like; a new one opens with the next reports.\n\n' + body);
  await fetch(WORKER + '/reports/sent', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: recs.map(r => r.key) }) });
  console.log(`::notice title=Error reports::Posted ${recs.length} new error(s) to GitHub.`);
}
main().catch(err => console.log('::warning title=Error reports::' + String(err.message || err).slice(0, 400)));
