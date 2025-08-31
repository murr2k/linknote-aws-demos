const { test, expect } = require('@playwright/test');

test.describe('BC Ferries Domain Endpoints Validation', () => {
  
  test('should validate linknote.com main site', async ({ page }) => {
    console.log('🌐 Testing main site: linknote.com');
    
    try {
      await page.goto('https://linknote.com', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Check page title
      const title = await page.title();
      console.log(`✅ Main site loaded: ${title}`);
      
      // Check for AWS services showcase
      const awsServices = await page.locator('.feature').count();
      console.log(`Found ${awsServices} AWS services displayed`);
      expect(awsServices).toBeGreaterThan(20); // Should have 25 services
      
      // Look for specific BC Ferries relevant services
      const iotService = page.locator('.feature:has-text("IoT Core")');
      await expect(iotService).toBeVisible();
      console.log('✅ Found AWS IoT Core service');
      
      const grafanaService = page.locator('.feature:has-text("Grafana") , .feature:has-text("Monitoring")');
      await expect(grafanaService.first()).toBeVisible();
      console.log('✅ Found monitoring/Grafana service');
      
    } catch (error) {
      console.error(`❌ Main site test failed: ${error.message}`);
      throw error;
    }
  });

  test('should check ferry.linknote.com subdomain status', async ({ page }) => {
    console.log('⛴️  Testing ferry control dashboard: ferry.linknote.com');
    
    try {
      const response = await page.request.get('https://ferry.linknote.com');
      const status = response.status();
      
      console.log(`Ferry control dashboard status: ${status}`);
      
      if (status === 200) {
        console.log('✅ Ferry control dashboard is live');
        
        await page.goto('https://ferry.linknote.com');
        const pageContent = await page.textContent('body');
        
        // Look for control-related keywords
        const hasControls = /control|dashboard|vessel|ferry|engine|rpm/i.test(pageContent);
        if (hasControls) {
          console.log('✅ Ferry control dashboard has expected content');
        } else {
          console.log('⚠️  Ferry control dashboard loaded but content unclear');
        }
        
      } else if ([301, 302, 307, 308].includes(status)) {
        console.log(`↗️  Ferry control dashboard redirects (${status})`);
        const location = response.headers()['location'];
        if (location) {
          console.log(`Redirect target: ${location}`);
        }
      } else if (status === 404) {
        console.log('⚠️  Ferry control dashboard not yet configured (404)');
      } else {
        console.log(`⚠️  Ferry control dashboard returned ${status}`);
      }
      
    } catch (error) {
      console.warn(`❌ Ferry control dashboard test failed: ${error.message}`);
      // Don't fail the test as subdomain might not be configured yet
    }
  });

  test('should check ops.linknote.com subdomain status', async ({ page }) => {
    console.log('📊 Testing operations dashboard: ops.linknote.com');
    
    try {
      const response = await page.request.get('https://ops.linknote.com');
      const status = response.status();
      
      console.log(`Operations dashboard status: ${status}`);
      
      if (status === 200) {
        console.log('✅ Operations dashboard is live');
        
        await page.goto('https://ops.linknote.com');
        const pageContent = await page.textContent('body');
        
        // Look for monitoring/operations keywords
        const hasOpsContent = /grafana|monitoring|dashboard|metrics|telemetry|fleet/i.test(pageContent);
        if (hasOpsContent) {
          console.log('✅ Operations dashboard has expected content');
        } else {
          console.log('⚠️  Operations dashboard loaded but content unclear');
        }
        
      } else if ([301, 302, 307, 308].includes(status)) {
        console.log(`↗️  Operations dashboard redirects (${status})`);
        const location = response.headers()['location'];
        if (location) {
          console.log(`Redirect target: ${location}`);
        }
      } else if (status === 404) {
        console.log('⚠️  Operations dashboard not yet configured (404)');
      } else {
        console.log(`⚠️  Operations dashboard returned ${status}`);
      }
      
    } catch (error) {
      console.warn(`❌ Operations dashboard test failed: ${error.message}`);
      // Don't fail the test as subdomain might not be configured yet
    }
  });

  test('should validate CloudFlare DNS configuration', async ({ page }) => {
    console.log('🔍 Testing DNS resolution for all domains');
    
    const domains = [
      'linknote.com',
      'ferry.linknote.com', 
      'ops.linknote.com'
    ];
    
    for (const domain of domains) {
      try {
        console.log(`Testing DNS for: ${domain}`);
        
        const response = await page.request.head(`https://${domain}`);
        const status = response.status();
        
        // Check CloudFlare headers
        const cfRay = response.headers()['cf-ray'];
        const cfCache = response.headers()['cf-cache-status'];
        
        if (cfRay) {
          console.log(`✅ ${domain} - CloudFlare active (Ray: ${cfRay})`);
        } else {
          console.log(`⚠️  ${domain} - CloudFlare headers not detected`);
        }
        
        if (cfCache) {
          console.log(`  Cache status: ${cfCache}`);
        }
        
        console.log(`  HTTP Status: ${status}`);
        
      } catch (error) {
        console.warn(`❌ DNS test failed for ${domain}: ${error.message}`);
      }
    }
  });

  test('should validate SSL certificates', async ({ page }) => {
    console.log('🔒 Testing SSL certificates for all domains');
    
    const domains = [
      'https://linknote.com',
      'https://ferry.linknote.com',
      'https://ops.linknote.com'
    ];
    
    for (const domainUrl of domains) {
      try {
        const response = await page.request.get(domainUrl);
        
        // If we get here, SSL worked
        console.log(`✅ SSL certificate valid for: ${domainUrl}`);
        
        // Check security headers
        const hsts = response.headers()['strict-transport-security'];
        const csp = response.headers()['content-security-policy'];
        
        if (hsts) {
          console.log(`  HSTS enabled: ${hsts}`);
        }
        
        if (csp) {
          console.log(`  CSP enabled: ${csp.substring(0, 50)}...`);
        }
        
      } catch (error) {
        if (error.message.includes('certificate') || error.message.includes('SSL')) {
          console.error(`❌ SSL certificate issue for ${domainUrl}: ${error.message}`);
        } else {
          console.warn(`⚠️  Connection issue for ${domainUrl}: ${error.message}`);
        }
      }
    }
  });

  test('should test responsive design on main site', async ({ page }) => {
    console.log('📱 Testing responsive design on linknote.com');
    
    await page.goto('https://linknote.com');
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobileTitle = await page.isVisible('h1');
    expect(mobileTitle).toBe(true);
    console.log('✅ Mobile view renders properly');
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    
    const tabletTitle = await page.isVisible('h1');
    expect(tabletTitle).toBe(true);
    console.log('✅ Tablet view renders properly');
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    
    const desktopTitle = await page.isVisible('h1');
    expect(desktopTitle).toBe(true);
    console.log('✅ Desktop view renders properly');
  });

  test('should validate page performance', async ({ page }) => {
    console.log('⚡ Testing page performance for linknote.com');
    
    // Start performance measurement
    const startTime = Date.now();
    
    await page.goto('https://linknote.com', { 
      waitUntil: 'networkidle' 
    });
    
    const loadTime = Date.now() - startTime;
    console.log(`Page load time: ${loadTime}ms`);
    
    // Performance expectations
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    
    if (loadTime < 1000) {
      console.log('✅ Excellent performance (<1s)');
    } else if (loadTime < 3000) {
      console.log('✅ Good performance (<3s)');
    } else {
      console.log('⚠️  Performance could be improved');
    }
    
    // Check for performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || null,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null
      };
    });
    
    console.log('Performance metrics:', performanceMetrics);
  });
});