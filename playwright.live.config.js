// Settings for the daily health check (.github/workflows/health.yml), which tests the live site
// the way a visitor uses it. Run by hand with: npx playwright test -c playwright.live.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/live',
  timeout: 60000,
  retries: 1, // one retry so a single slow moment doesn't count as broken
  reporter: [['list'], ['json', { outputFile: 'health-results.json' }]],
  use: { baseURL: 'https://hornyhealer.github.io/Commander-Deck-Ledger/', trace: 'retain-on-failure' },
  projects: [{ name: 'live', use: { ...devices['Desktop Chrome'] } }],
});
