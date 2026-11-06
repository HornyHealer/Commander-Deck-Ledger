// Automatic tests for the Commander Deck Ledger. GitHub runs these before every deploy.
// Run locally with: npm install && npx playwright install chromium && npm test
const { defineConfig, devices } = require('@playwright/test');

// js/app.js is built from the files in js/src/; build it first so the tests always run the current code.
require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, 'scripts', 'build-app.mjs')], { stdio: 'inherit' });

module.exports = defineConfig({
  testDir: 'tests',
  testIgnore: ['live/**', 'db-rules/**'], // the live check has its own settings (playwright.live.config.js); db-rules runs on Firebase's emulator
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Reduced motion skips the view-switch glitch, whose look-only copies of the page would otherwise show up in
  // searches for buttons and rows for a moment; tests/motion.spec.js turns motion back on to test the glitch.
  // The card bin starts open here (on the site it starts folded), so tests can check what's in it;
  // tests/look.spec.js covers the fold itself.
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', contextOptions: { reducedMotion: 'reduce' },
    storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:4173', localStorage: [{ name: 'cdl-bin-open', value: '1' }] }] } },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone checks run only the tests tagged @phone.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
