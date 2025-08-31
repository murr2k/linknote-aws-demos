// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests sequentially for deployment
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker for deployment tests
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/test-results.json' }],
    ['list']
  ],
  use: {
    baseURL: 'https://linknote.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'deployment-tests',
      testMatch: 'deployment-test.spec.js',
      timeout: 60 * 60 * 1000, // 60 minutes for deployment tests
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
    
    {
      name: 'endpoint-validation',
      testMatch: 'endpoint-*.spec.js',
      timeout: 5 * 60 * 1000, // 5 minutes for endpoint tests
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
      dependencies: ['deployment-tests'], // Run after deployment
    },

    {
      name: 'dual-dashboard-tests',
      testMatch: 'dual-dashboard-*.spec.js',
      timeout: 10 * 60 * 1000, // 10 minutes for dual dashboard tests
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Show browser for demonstration
      },
    }
  ],

  // Global test timeout
  globalTimeout: 90 * 60 * 1000, // 90 minutes total
  
  // Test output directories
  outputDir: 'test-results/artifacts',
});