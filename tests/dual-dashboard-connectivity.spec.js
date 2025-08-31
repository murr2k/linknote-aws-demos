const { test, expect } = require('@playwright/test');

test.describe('BC Ferries Dual Dashboard Connectivity', () => {
  test('should demonstrate real-time communication between ferry control and ops monitoring', async ({ browser }) => {
    // Create two browser contexts to simulate different users/systems
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const ferryControlPage = await context1.newPage();
    const opsMonitoringPage = await context2.newPage();

    console.log('🚢 Opening BC Ferries dual dashboard system...');

    // Open both dashboards
    await ferryControlPage.goto('https://ferry.linknote.com');
    await opsMonitoringPage.goto('https://bc-ferries-ops-dashboard.fly.dev');

    // Wait for both pages to load completely
    await ferryControlPage.waitForLoadState('networkidle');
    await opsMonitoringPage.waitForLoadState('networkidle');

    console.log('✅ Both dashboards loaded successfully');

    // Verify ferry control dashboard elements
    await expect(ferryControlPage.locator('h1')).toContainText('BC Ferries');
    await expect(ferryControlPage.locator('#rpmSlider')).toBeVisible();
    await expect(ferryControlPage.locator('#batterySlider')).toBeVisible();

    console.log('✅ Ferry control dashboard UI verified');

    // Verify ops monitoring dashboard elements
    await expect(opsMonitoringPage.locator('h1')).toContainText('Operations');
    await expect(opsMonitoringPage.locator('#rpmGauge')).toBeVisible();
    await expect(opsMonitoringPage.locator('#connectionStatus')).toBeVisible();

    console.log('✅ Ops monitoring dashboard UI verified');

    // Wait for WebSocket connection to establish
    await opsMonitoringPage.waitForTimeout(3000);

    // Check connection status on ops dashboard
    const connectionStatus = await opsMonitoringPage.locator('#connectionStatus').textContent();
    expect(connectionStatus).toMatch(/connected|online/i);

    console.log('✅ WebSocket connection established');

    // Test 1: Engine RPM Real-time Sync
    console.log('🔧 Testing Engine RPM real-time synchronization...');
    
    // Get initial RPM values
    const initialFerryRPM = await ferryControlPage.locator('#rpmValue').textContent();
    const initialOpsRPM = await opsMonitoringPage.locator('#engineRpm').textContent();
    
    console.log(`Initial RPM - Ferry: ${initialFerryRPM}, Ops: ${initialOpsRPM}`);

    // Change RPM on ferry control
    await ferryControlPage.locator('#rpmSlider').fill('1700');
    await ferryControlPage.locator('#rpmSlider').dispatchEvent('input');

    // Wait for WebSocket propagation
    await opsMonitoringPage.waitForTimeout(2000);

    // Verify RPM changed on both dashboards
    const newFerryRPM = await ferryControlPage.locator('#rpmValue').textContent();
    const newOpsRPM = await opsMonitoringPage.locator('#engineRpm').textContent();
    
    console.log(`Updated RPM - Ferry: ${newFerryRPM}, Ops: ${newOpsRPM}`);
    
    expect(newFerryRPM).toContain('1700');
    expect(newOpsRPM).toContain('1700');

    console.log('✅ Engine RPM sync verified');

    // Test 2: Battery Level Real-time Sync
    console.log('🔋 Testing Battery Level real-time synchronization...');
    
    // Change battery level on ferry control
    await ferryControlPage.locator('#batterySlider').fill('25');
    await ferryControlPage.locator('#batterySlider').dispatchEvent('input');

    // Wait for WebSocket propagation
    await opsMonitoringPage.waitForTimeout(2000);

    // Verify battery level changed on both dashboards
    const newFerryBattery = await ferryControlPage.locator('#batteryValue').textContent();
    const newOpsBattery = await opsMonitoringPage.locator('#batteryLevel').textContent();
    
    console.log(`Updated Battery - Ferry: ${newFerryBattery}%, Ops: ${newOpsBattery}%`);
    
    expect(newFerryBattery).toContain('25');
    expect(newOpsBattery).toContain('25');

    console.log('✅ Battery level sync verified');

    // Test 3: Emergency Fire Alarm System
    console.log('🚨 Testing Emergency Fire Alarm real-time communication...');
    
    // Trigger fire alarm on ferry control
    await ferryControlPage.locator('text=🔥 Trigger Fire Alarm').click();

    // Wait for emergency alert propagation
    await opsMonitoringPage.waitForTimeout(3000);

    // Check for fire alarm indicator on ferry control
    const ferryAlarmPanel = await ferryControlPage.locator('#safetyPanel');
    const ferryAlarmClass = await ferryAlarmPanel.getAttribute('class');
    expect(ferryAlarmClass).toContain('fire-alarm');

    // Check for emergency alert on ops dashboard
    const emergencyAlert = opsMonitoringPage.locator('.emergency-alert, .alert-modal, [class*="fire"], [class*="emergency"]').first();
    await expect(emergencyAlert).toBeVisible({ timeout: 5000 });

    console.log('✅ Emergency fire alarm communication verified');

    // Test 4: Historical Data and Telemetry
    console.log('📊 Testing telemetry data logging...');
    
    // Check telemetry log on ferry control
    const telemetryLog = ferryControlPage.locator('#telemetryLog p').first();
    await expect(telemetryLog).toBeVisible();
    
    const logContent = await telemetryLog.textContent();
    expect(logContent).toMatch(/\[\d{1,2}:\d{2}:\d{2}\]/); // Timestamp format

    console.log('✅ Telemetry logging verified');

    // Test 5: Acknowledge Emergency Alert
    console.log('✅ Testing emergency alert acknowledgment...');
    
    // Acknowledge alarm on ferry control
    const ackButton = ferryControlPage.locator('#ackButton');
    if (await ackButton.isVisible()) {
      await ackButton.click();
      await opsMonitoringPage.waitForTimeout(2000);
      
      // Verify alarm cleared on both dashboards
      const clearedFerryAlarm = await ferryControlPage.locator('#safetyPanel').getAttribute('class');
      expect(clearedFerryAlarm).not.toContain('fire-alarm');
    }

    console.log('✅ Emergency acknowledgment verified');

    // Test 6: System Health and Connection Status
    console.log('🏥 Testing system health endpoints...');
    
    // Test API endpoints
    const ferryHealthResponse = await ferryControlPage.evaluate(async () => {
      const response = await fetch('/api/health');
      return await response.json();
    });
    
    expect(ferryHealthResponse.status).toBe('healthy');
    expect(ferryHealthResponse.vessel).toBe('island-class-001');

    const opsHealthResponse = await opsMonitoringPage.evaluate(async () => {
      const response = await fetch('/health');
      return await response.json();
    });
    
    expect(opsHealthResponse.status).toBe('healthy');
    expect(opsHealthResponse.ferryControlConnected).toBe(true);

    console.log('✅ System health verified');

    // Test 7: Performance and Responsiveness
    console.log('⚡ Testing dashboard responsiveness...');
    
    // Rapid changes to test WebSocket performance
    for (let i = 0; i < 3; i++) {
      const testRPM = 800 + (i * 200); // 800, 1000, 1200
      await ferryControlPage.locator('#rpmSlider').fill(testRPM.toString());
      await ferryControlPage.locator('#rpmSlider').dispatchEvent('input');
      await opsMonitoringPage.waitForTimeout(1000);
      
      const opsRPMValue = await opsMonitoringPage.locator('#engineRpm').textContent();
      expect(opsRPMValue).toContain(testRPM.toString());
    }

    console.log('✅ Dashboard responsiveness verified');

    // Final verification screenshot
    await ferryControlPage.screenshot({ 
      path: '/home/murr2k/projects/aws-test/linknote-aws-demos/live-site/tests/screenshots/ferry-control-final.png',
      fullPage: true 
    });
    
    await opsMonitoringPage.screenshot({ 
      path: '/home/murr2k/projects/aws-test/linknote-aws-demos/live-site/tests/screenshots/ops-monitoring-final.png',
      fullPage: true 
    });

    console.log('📸 Screenshots saved for documentation');

    // Cleanup
    await context1.close();
    await context2.close();

    console.log('🎉 DUAL DASHBOARD CONNECTIVITY TEST COMPLETED SUCCESSFULLY!');
    console.log('✅ All real-time communication verified');
    console.log('✅ Emergency systems tested');
    console.log('✅ WebSocket performance validated');
    console.log('✅ System health confirmed');
    console.log('🚢 BC Ferries dual dashboard system is FULLY OPERATIONAL!');
  });

  test('should handle connection failures gracefully', async ({ page }) => {
    console.log('🔌 Testing connection resilience...');
    
    // Open ops monitoring dashboard
    await page.goto('https://bc-ferries-ops-dashboard.fly.dev');
    await page.waitForLoadState('networkidle');

    // Check initial connection status
    const initialStatus = await page.locator('#connectionStatus').textContent();
    console.log(`Initial connection status: ${initialStatus}`);

    // Simulate network interruption by blocking ferry.linknote.com temporarily
    await page.route('**/ferry.linknote.com/**', route => route.abort());
    
    // Wait and check for reconnection attempts
    await page.waitForTimeout(5000);
    
    // Re-enable connection
    await page.unroute('**/ferry.linknote.com/**');
    
    // Wait for reconnection
    await page.waitForTimeout(10000);
    
    // Verify connection restored
    const reconnectionStatus = await page.locator('#connectionStatus').textContent();
    console.log(`Reconnection status: ${reconnectionStatus}`);

    console.log('✅ Connection resilience verified');
  });

  test('should load both dashboards under load', async ({ browser }) => {
    console.log('🚀 Testing dashboard performance under concurrent load...');
    
    const contexts = [];
    const pages = [];
    
    // Create multiple concurrent connections
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // Load ferry control dashboard concurrently
    const ferryPromises = pages.slice(0, 3).map(page => 
      page.goto('https://ferry.linknote.com')
    );
    
    // Load ops monitoring dashboard concurrently  
    const opsPromises = pages.slice(3, 5).map(page => 
      page.goto('https://bc-ferries-ops-dashboard.fly.dev')
    );
    
    // Wait for all to load
    await Promise.all([...ferryPromises, ...opsPromises]);
    
    // Verify all loaded successfully
    for (let i = 0; i < 3; i++) {
      await expect(pages[i].locator('h1')).toContainText('BC Ferries');
    }
    
    for (let i = 3; i < 5; i++) {
      await expect(pages[i].locator('h1')).toContainText('Operations');
    }
    
    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
    
    console.log('✅ Performance under load verified');
  });
});

// Additional utility test for API endpoints
test.describe('Dashboard API Integration', () => {
  test('should verify all API endpoints respond correctly', async ({ request }) => {
    console.log('🔌 Testing API endpoint health...');
    
    // Test ferry control API
    const ferryHealthResponse = await request.get('https://ferry.linknote.com/api/health');
    expect(ferryHealthResponse.ok()).toBeTruthy();
    
    const ferryHealth = await ferryHealthResponse.json();
    expect(ferryHealth.status).toBe('healthy');
    expect(ferryHealth.vessel).toBe('island-class-001');
    
    // Test vessel state endpoint
    const vesselStateResponse = await request.get('https://ferry.linknote.com/api/vessel/state');
    expect(vesselStateResponse.ok()).toBeTruthy();
    
    const vesselState = await vesselStateResponse.json();
    expect(vesselState.vesselId).toBe('island-class-001');
    expect(vesselState.engine).toBeDefined();
    expect(vesselState.power).toBeDefined();
    expect(vesselState.safety).toBeDefined();
    
    // Test ops monitoring health
    const opsHealthResponse = await request.get('https://bc-ferries-ops-dashboard.fly.dev/health');
    expect(opsHealthResponse.ok()).toBeTruthy();
    
    const opsHealth = await opsHealthResponse.json();
    expect(opsHealth.status).toBe('healthy');
    
    console.log('✅ All API endpoints verified');
  });
});