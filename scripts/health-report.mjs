// Turns the daily health check's results into a GitHub issue: opens one when something fails
// (or comments on the open one), and closes it when everything passes again.
// Runs in .github/workflows/health.yml with GH_TOKEN set.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const LABEL = 'health-check';
const run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;

let results = null;
try { results = JSON.parse(readFileSync('health-results.json', 'utf8')); } catch {}
const failed = [];
const walk = suite => {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    const t = spec.tests && spec.tests[0]; const last = t && t.results && t.results[t.results.length - 1];
    if (!spec.ok) failed.push({ title: spec.title, error: String((last && last.error && last.error.message) || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n') });
  }
};
if (results) walk(results);
const broke = !results || failed.length > 0;

try { gh('label', 'create', LABEL, '--color', 'D93F0B', '--description', 'Opened by the daily health check', '--force'); } catch {}
const open = JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '1'));
const today = new Date().toISOString().slice(0, 10);

if (broke) {
  const body = (results
    ? `The daily check of the live site found ${failed.length} problem${failed.length === 1 ? '' : 's'} on ${today}:\n\n` + failed.map(f => `- **${f.title}**\n\n  \`\`\`\n  ${f.error.replace(/\n/g, '\n  ')}\n  \`\`\``).join('\n')
    : `The daily check couldn't run its tests on ${today}.`) + `\n\nDetails: ${run}\n\nThis closes by itself once a check passes.`;
  if (open.length) gh('issue', 'comment', String(open[0].number), '--body', body);
  else gh('issue', 'create', '--title', `Daily check: ${failed.map(f => f.title).join('; ').slice(0, 120) || 'could not run'}`, '--label', LABEL, '--body', body);
  console.log(`::error title=Daily check::${failed.length} problem(s): ${failed.map(f => f.title).join('; ')}`);
  process.exit(1);
} else {
  if (open.length) { gh('issue', 'comment', String(open[0].number), '--body', `All checks pass again (${today}). ${run}`); gh('issue', 'close', String(open[0].number)); }
  console.log(`::notice title=Daily check::All ${results ? 'checks' : ''} passed.`);
}
