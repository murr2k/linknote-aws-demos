// Maritime Operations Dashboard Main Controller

class OperationsDashboard {
  constructor() {
    this.vessels = new Map();
    this.alerts = [];
    this.selectedVessel = null;
    this.systemStatus = {};
    this.weatherData = {};
    this.routeStatus = [];
    
    // Initialization tracking
    this.isReady = false;
    this.initRetryCount = 0;
    this.readyCallbacks = [];

    // Initialize elements with empty object as fallback
    this.elements = {};

    // Initialize components with retry logic
    this.initializeElements(); // Now has retry logic
    this.startClock();
    this.setupEventListeners();
    
    console.log('🚢 BC Ferries Operations Dashboard initialized');
  }
  
  // Method to allow other components to wait for dashboard readiness
  onReady(callback) {
    if (this.isReady) {
      callback(this);
    } else {
      this.readyCallbacks.push(callback);
    }
  }
  
  initializeElements() {
    console.log('[DOM-CHECK] Initializing dashboard elements');
    
    // Check DOM readiness state
    const domState = document.readyState;
    console.log('[DOM-CHECK] Document ready state:', domState);
    
    // If DOM not fully ready, schedule retry
    if (domState !== 'complete') {
      console.log('[DOM-CHECK] DOM not complete, scheduling retry in 50ms');
      setTimeout(() => this.initializeElements(), 50);
      return;
    }
    
    // Attempt element queries
    this.elements = this.queryElements();
    
    // Verify critical elements were found
    const criticalMissing = this.validateCriticalElements();
    if (criticalMissing.length > 0 && this.initRetryCount < 5) {
      console.warn(`[DOM-CHECK] Missing critical elements: ${criticalMissing.join(', ')}, retrying in ${50 * (this.initRetryCount + 1)}ms`);
      this.initRetryCount = (this.initRetryCount || 0) + 1;
      setTimeout(() => this.initializeElements(), 50 * this.initRetryCount);
      return;
    }
    
    // Elements ready or max retries reached
    this.initRetryCount = 0;
    console.log('[DOM-CHECK] ✅ Element initialization complete');
    
    // Notify any waiting components that dashboard is ready
    this.isReady = true;
    this.notifyReady();
  }
  
  queryElements() {
    return {
      connectionStatus: document.getElementById('connectionStatus'),
      wsStatusIndicator: document.getElementById('wsStatusIndicator'),
      wsStatusText: document.getElementById('wsStatusText'),
      mqttStatusIndicator: document.getElementById('mqttStatusIndicator'),
      mqttStatusText: document.getElementById('mqttStatusText'),
      currentTime: document.getElementById('currentTime'),
      currentDate: document.getElementById('currentDate'),
      weatherSummary: document.getElementById('weatherSummary'),
      weatherText: document.getElementById('weatherText'),
      alertSummary: document.getElementById('alertSummary'),
      alertCount: document.getElementById('alertCount'),
      
      // Fleet overview elements
      operationalVessels: document.getElementById('operationalVessels'),
      maintenanceVessels: document.getElementById('maintenanceVessels'),
      emergencyVessels: document.getElementById('emergencyVessels'),
      vesselList: document.getElementById('vesselList'),
      
      // Vessel detail elements
      vesselSelect: document.getElementById('vesselSelect'),
      vesselDetailContent: document.getElementById('vesselDetailContent'),
      
      // Engine gauges
      rpmValue: document.getElementById('rpmValue'),
      tempValue: document.getElementById('tempValue'),
      fuelValue: document.getElementById('fuelValue'),
      
      // Power systems
      batteryProgress: document.getElementById('batteryProgress'),
      batteryText: document.getElementById('batteryText'),
      generatorProgress: document.getElementById('generatorProgress'),
      generatorText: document.getElementById('generatorText'),
      powerMode: document.getElementById('powerMode'),
      
      // Safety systems
      fireIcon: document.getElementById('fireIcon'),
      fireStatus: document.getElementById('fireStatus'),
      bilgeIcon: document.getElementById('bilgeIcon'),
      bilgeStatus: document.getElementById('bilgeStatus'),
      co2Icon: document.getElementById('co2Icon'),
      co2Status: document.getElementById('co2Status'),
      
      // Navigation
      speedValue: document.getElementById('speedValue'),
      headingValue: document.getElementById('headingValue'),
      routeValue: document.getElementById('routeValue'),
      waypointValue: document.getElementById('waypointValue'),
      positionValue: document.getElementById('positionValue'),
      compassNeedle: document.getElementById('compassNeedle'),
      
      // Weather
      windValue: document.getElementById('windValue'),
      windDirection: document.getElementById('windDirection'),
      waveValue: document.getElementById('waveValue'),
      visibilityValue: document.getElementById('visibilityValue'),
      temperatureValue: document.getElementById('temperatureValue'),
      
      // Alerts
      alertsList: document.getElementById('alertsList'),
      
      // Modals
      emergencyModal: document.getElementById('emergencyModal'),
      emergencyDetails: document.getElementById('emergencyDetails'),
      loadingOverlay: document.getElementById('loadingOverlay')
    };
  }
  
  validateCriticalElements() {
    const critical = [
      'mqttStatusIndicator', 
      'mqttStatusText', 
      'wsStatusIndicator', 
      'wsStatusText'
    ];
    
    const missing = [];
    critical.forEach(elementName => {
      if (!this.elements[elementName]) {
        missing.push(elementName);
        console.error(`[DOM-CHECK] ❌ Critical element missing: ${elementName}`);
      } else {
        console.log(`[DOM-CHECK] ✅ Critical element found: ${elementName}`);
      }
    });
    
    return missing;
  }
  
  notifyReady() {
    // Execute waiting callbacks
    this.readyCallbacks.forEach(callback => {
      try {
        callback(this);
      } catch (error) {
        console.error('[DOM-CHECK] Error in ready callback:', error);
      }
    });
    this.readyCallbacks = [];

    // Dispatch custom event that dashboard is ready
    window.dispatchEvent(new CustomEvent('dashboardReady', {
      detail: { dashboard: this }
    }));
    console.log('[DOM-CHECK] 📢 Dashboard ready event dispatched');

    // Try to update fleet overview if we have vessels
    if (this.vessels && this.vessels.size > 0) {
      console.log('[DOM-CHECK] 🚢 Found vessels on ready, updating fleet overview');
      setTimeout(() => this.updateFleetOverview(), 100);
    }
  }

  setupEventListeners() {
    // Check if elements are available
    if (!this.elements) {
      console.log('[EVENTS] Elements not ready, skipping event listeners');
      return;
    }

    // Vessel selection
    if (this.elements.vesselSelect) {
      this.elements.vesselSelect.addEventListener('change', (e) => {
        this.selectVessel(e.target.value);
      });
    }
    
    // Alert filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.filterAlerts(e.target.dataset.filter);
      });
    });
    
    // Historical chart controls
    const chartMetric = document.getElementById('chartMetric');
    const chartRange = document.getElementById('chartRange');
    const exportBtn = document.getElementById('exportData');

    if (chartMetric && chartRange) {
      chartMetric.addEventListener('change', () => this.updateHistoricalChart());
      chartRange.addEventListener('change', () => this.updateHistoricalChart());
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHistoricalData());
    }
  }
  
  startClock() {
    const updateClock = () => {
      const now = new Date();

      // Check if elements are available
      if (!this.elements || !this.elements.currentTime || !this.elements.currentDate) {
        console.log('[CLOCK] Elements not ready yet');
        return;
      }

      // Update time
      const timeOptions = {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/Vancouver'
      };

      const dateOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Vancouver'
      };

      this.elements.currentTime.textContent = now.toLocaleTimeString('en-US', timeOptions) + ' PST';
      this.elements.currentDate.textContent = now.toLocaleDateString('en-US', dateOptions);
    };

    updateClock();
    setInterval(updateClock, 1000);
  }
  
  updateWebSocketStatus(status) {
    const { wsStatusIndicator, wsStatusText } = this.elements;
    
    // Remove existing WebSocket status classes
    wsStatusIndicator.classList.remove('connected', 'connecting', 'disconnected', 'error', 'failed');
    
    switch (status) {
      case 'connected':
        wsStatusIndicator.classList.add('connected');
        wsStatusText.textContent = 'WebSocket: Connected';
        break;
      case 'connecting':
        wsStatusIndicator.classList.add('connecting');
        wsStatusText.textContent = 'WebSocket: Connecting...';
        break;
      case 'disconnected':
        wsStatusIndicator.classList.add('disconnected');
        wsStatusText.textContent = 'WebSocket: Disconnected';
        break;
      case 'error':
        wsStatusIndicator.classList.add('error');
        wsStatusText.textContent = 'WebSocket: Error';
        break;
      case 'failed':
        wsStatusIndicator.classList.add('failed');
        wsStatusText.textContent = 'WebSocket: Failed';
        break;
    }
    
    this.updateOverallConnectionStatus();
  }
  
  updateMQTTStatus(status) {
    console.log('[STATUS-UPDATE] 🔄 updateMQTTStatus called with status:', status, 'at', new Date().toISOString());
    
    const { mqttStatusIndicator, mqttStatusText } = this.elements;
    
    // Check if DOM elements exist
    if (!mqttStatusIndicator) {
      console.error('[DOM-CHECK] ❌ mqttStatusIndicator element not found!');
      return;
    }
    if (!mqttStatusText) {
      console.error('[DOM-CHECK] ❌ mqttStatusText element not found!');
      return;
    }
    
    console.log('[DOM-CHECK] ✅ MQTT status elements found and accessible');
    
    // Remove existing MQTT status classes
    mqttStatusIndicator.classList.remove('connected', 'connecting', 'disconnected', 'error', 'failed', 'offline');
    
    switch (status) {
      case 'connected':
        console.log('[UI-UPDATE] Setting MQTT status to connected');
        mqttStatusIndicator.classList.add('connected');
        mqttStatusText.textContent = 'MQTT: Connected';
        break;
      case 'connecting':
        console.log('[UI-UPDATE] Setting MQTT status to connecting');
        mqttStatusIndicator.classList.add('connecting');
        mqttStatusText.textContent = 'MQTT: Connecting...';
        break;
      case 'disconnected':
        console.log('[UI-UPDATE] Setting MQTT status to disconnected');
        mqttStatusIndicator.classList.add('disconnected');
        mqttStatusText.textContent = 'MQTT: Disconnected';
        break;
      case 'error':
        console.log('[UI-UPDATE] Setting MQTT status to error');
        mqttStatusIndicator.classList.add('error');
        mqttStatusText.textContent = 'MQTT: Error';
        break;
      case 'failed':
        console.log('[UI-UPDATE] Setting MQTT status to failed');
        mqttStatusIndicator.classList.add('failed');
        mqttStatusText.textContent = 'MQTT: Failed';
        break;
      case 'offline':
        console.log('[UI-UPDATE] Setting MQTT status to offline');
        mqttStatusIndicator.classList.add('offline');
        mqttStatusText.textContent = 'MQTT: Offline';
        break;
      case 'unavailable':
        console.log('[UI-UPDATE] Setting MQTT status to unavailable');
        mqttStatusIndicator.classList.add('unavailable');
        mqttStatusText.textContent = 'MQTT: Broker Unavailable';
        break;
    }
    
    console.log('[STATUS-UPDATE] Calling updateOverallConnectionStatus');
    this.updateOverallConnectionStatus();
  }
  
  updateOverallConnectionStatus() {
    // Update overall connection status based on both protocols
    this.elements.connectionStatus.classList.remove('connected', 'partial', 'disconnected');
    
    const wsConnected = this.elements.wsStatusIndicator.classList.contains('connected');
    const mqttConnected = this.elements.mqttStatusIndicator.classList.contains('connected');
    
    if (wsConnected && mqttConnected) {
      this.elements.connectionStatus.classList.add('connected');
    } else if (wsConnected || mqttConnected) {
      this.elements.connectionStatus.classList.add('partial');
    } else {
      this.elements.connectionStatus.classList.add('disconnected');
    }
  }
  
  updateFleetOverview() {
    console.log('🔄 updateFleetOverview called, vessel count:', this.vessels.size);

    let operational = 0, maintenance = 0, emergency = 0;

    this.vessels.forEach(vessel => {
      switch (vessel.status) {
        case 'normal':
          operational++;
          break;
        case 'warning':
        case 'caution':
          maintenance++;
          break;
        case 'emergency':
          emergency++;
          break;
      }
    });

    if (this.elements.operationalVessels) {
      this.elements.operationalVessels.textContent = operational;
    }
    if (this.elements.maintenanceVessels) {
      this.elements.maintenanceVessels.textContent = maintenance;
    }
    if (this.elements.emergencyVessels) {
      this.elements.emergencyVessels.textContent = emergency;
    }

    this.renderVesselList();
  }
  
  renderVesselList() {
    const vesselList = this.elements.vesselList;
    if (!vesselList) {
      console.warn('vesselList element not found, skipping vessel list render');
      return;
    }
    vesselList.innerHTML = '';

    // Update vessel selector
    const vesselSelect = this.elements.vesselSelect;
    if (!vesselSelect) {
      console.warn('vesselSelect element not found, skipping dropdown update');
      return;
    }
    const currentValue = vesselSelect.value;
    vesselSelect.innerHTML = '<option value="">Select Vessel...</option>';

    // Re-attach event listener since we're replacing innerHTML
    vesselSelect.onchange = (e) => {
      console.log('🎯 Vessel selected from dropdown:', e.target.value);
      this.selectVessel(e.target.value);
    };
    
    this.vessels.forEach((vessel, vesselId) => {
      // Add to list
      const vesselItem = document.createElement('div');
      vesselItem.className = `vessel-item ${vessel.status}`;
      vesselItem.onclick = () => this.selectVessel(vesselId);
      
      vesselItem.innerHTML = `
        <div class="vessel-info">
          <div>
            <div class="vessel-name">${vesselId.toUpperCase()}</div>
            <div class="vessel-route">${vessel.navigation?.route || 'N/A'}</div>
          </div>
          <div class="vessel-status">${vessel.operationalState || 'Unknown'}</div>
        </div>
      `;
      
      vesselList.appendChild(vesselItem);
      
      // Add to selector
      const option = document.createElement('option');
      option.value = vesselId;
      option.textContent = vesselId.toUpperCase();
      if (vesselId === currentValue) {
        option.selected = true;
      }
      vesselSelect.appendChild(option);
    });
  }
  
  selectVessel(vesselId) {
    if (!vesselId) {
      this.selectedVessel = null;
      this.elements.vesselDetailContent.innerHTML = `
        <div class="no-selection">
          <i class="fas fa-ship fa-3x"></i>
          <p>Select a vessel to view detailed telemetry</p>
        </div>
      `;
      this.clearGauges();
      return;
    }

    this.selectedVessel = vesselId;
    this.elements.vesselSelect.value = vesselId;

    const vessel = this.vessels.get(vesselId);
    if (vessel) {
      this.renderVesselDetail(vessel);
      this.updateGauges(vessel);
      this.updatePowerSystems(vessel);
      this.updateSafetySystems(vessel);
      this.updateNavigation(vessel);

      // Request historical data for the newly selected vessel
      this.updateHistoricalChart();
    }
  }
  
  renderVesselDetail(vessel) {
    const lastUpdate = new Date(vessel.timestamp).toLocaleTimeString();
    
    this.elements.vesselDetailContent.innerHTML = `
      <div class="vessel-detail-grid">
        <div class="detail-section">
          <h3><i class="fas fa-info-circle"></i> Vessel Information</h3>
          <div class="detail-item">
            <span class="detail-label">Vessel ID:</span>
            <span class="detail-value">${vessel.vesselId}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status:</span>
            <span class="detail-value status-${vessel.status}">${vessel.status.toUpperCase()}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Last Update:</span>
            <span class="detail-value">${lastUpdate}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Operational State:</span>
            <span class="detail-value">${vessel.operationalState || 'Unknown'}</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h3><i class="fas fa-map-marker-alt"></i> Position</h3>
          <div class="detail-item">
            <span class="detail-label">Latitude:</span>
            <span class="detail-value">${vessel.location?.latitude?.toFixed(4) || 'N/A'}°</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Longitude:</span>
            <span class="detail-value">${vessel.location?.longitude?.toFixed(4) || 'N/A'}°</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Heading:</span>
            <span class="detail-value">${vessel.location?.heading || 'N/A'}°</span>
          </div>
        </div>
      </div>
    `;
  }
  
  updateGauges(vessel) {
    if (!vessel.engine) return;
    
    // Update gauge values
    this.elements.rpmValue.textContent = `${vessel.engine.rpm || 0} RPM`;
    this.elements.tempValue.textContent = `${vessel.engine.temperature || 0}°C`;
    this.elements.fuelValue.textContent = `${vessel.engine.fuelFlow || 0} L/h`;
    
    // Update actual gauges (will be handled by gauges.js)
    if (window.engineGauges) {
      window.engineGauges.updateRPM(vessel.engine.rpm || 0);
      window.engineGauges.updateTemperature(vessel.engine.temperature || 0);
      window.engineGauges.updateFuelFlow(vessel.engine.fuelFlow || 0);
    }
  }
  
  clearGauges() {
    this.elements.rpmValue.textContent = '-- RPM';
    this.elements.tempValue.textContent = '-- °C';
    this.elements.fuelValue.textContent = '-- L/h';
    
    if (window.engineGauges) {
      window.engineGauges.updateRPM(0);
      window.engineGauges.updateTemperature(0);
      window.engineGauges.updateFuelFlow(0);
    }
  }
  
  updatePowerSystems(vessel) {
    if (!vessel.power) return;
    
    const batterySOC = vessel.power.batterySOC || 0;
    const generatorLoad = vessel.power.generatorLoad || 0;
    const powerMode = vessel.power.mode || 'Unknown';
    
    // Update battery progress bar
    this.elements.batteryProgress.style.width = `${batterySOC}%`;
    this.elements.batteryText.textContent = `${batterySOC}%`;
    
    // Color coding for battery
    if (batterySOC < 20) {
      this.elements.batteryProgress.style.background = 'linear-gradient(90deg, var(--red-critical), var(--red-emergency))';
    } else if (batterySOC < 40) {
      this.elements.batteryProgress.style.background = 'linear-gradient(90deg, var(--yellow-warning), var(--orange-caution))';
    } else {
      this.elements.batteryProgress.style.background = 'linear-gradient(90deg, var(--green-ok), var(--blue-accent))';
    }
    
    // Update generator progress bar
    this.elements.generatorProgress.style.width = `${generatorLoad}%`;
    this.elements.generatorText.textContent = `${generatorLoad}%`;
    
    // Update power mode
    this.elements.powerMode.textContent = powerMode.toUpperCase();
    this.elements.powerMode.className = `power-mode mode-${powerMode.toLowerCase()}`;
  }
  
  updateSafetySystems(vessel) {
    if (!vessel.safety) return;
    
    // Fire alarm
    if (vessel.safety.fireAlarm) {
      this.elements.fireIcon.className = 'safety-icon critical';
      this.elements.fireStatus.textContent = 'ALARM';
      this.elements.fireStatus.style.color = 'var(--red-critical)';
    } else {
      this.elements.fireIcon.className = 'safety-icon';
      this.elements.fireStatus.textContent = 'NORMAL';
      this.elements.fireStatus.style.color = 'var(--green-ok)';
    }
    
    // Bilge level
    const bilgeLevel = vessel.safety.bilgeLevel || 0;
    this.elements.bilgeStatus.textContent = `${bilgeLevel} cm`;
    
    if (bilgeLevel > 60) {
      this.elements.bilgeIcon.className = 'safety-icon critical';
      this.elements.bilgeStatus.style.color = 'var(--red-critical)';
    } else if (bilgeLevel > 40) {
      this.elements.bilgeIcon.className = 'safety-icon warning';
      this.elements.bilgeStatus.style.color = 'var(--yellow-warning)';
    } else {
      this.elements.bilgeIcon.className = 'safety-icon';
      this.elements.bilgeStatus.style.color = 'var(--green-ok)';
    }
    
    // CO2 level
    const co2Level = vessel.safety.co2Level || 0;
    this.elements.co2Status.textContent = `${co2Level} ppm`;
    
    if (co2Level > 1000) {
      this.elements.co2Icon.className = 'safety-icon critical';
      this.elements.co2Status.style.color = 'var(--red-critical)';
    } else if (co2Level > 800) {
      this.elements.co2Icon.className = 'safety-icon warning';
      this.elements.co2Status.style.color = 'var(--yellow-warning)';
    } else {
      this.elements.co2Icon.className = 'safety-icon';
      this.elements.co2Status.style.color = 'var(--green-ok)';
    }
  }
  
  updateNavigation(vessel) {
    if (!vessel.navigation) return;
    
    // Update navigation values
    this.elements.speedValue.textContent = `${vessel.navigation.speed || 0} kts`;
    this.elements.routeValue.textContent = vessel.navigation.route || '--';
    this.elements.waypointValue.textContent = vessel.navigation.nextWaypoint || '--';
    
    if (vessel.location) {
      this.elements.headingValue.textContent = `${vessel.location.heading || 0}°`;
      this.elements.positionValue.textContent = 
        `${vessel.location.latitude?.toFixed(4) || '--'}°N, ${Math.abs(vessel.location.longitude || 0).toFixed(4)}°W`;
      
      // Update compass needle
      const heading = vessel.location.heading || 0;
      this.elements.compassNeedle.style.transform = 
        `translate(-50%, -100%) rotate(${heading}deg)`;
    }
  }
  
  updateWeather(weatherData) {
    this.weatherData = weatherData;
    
    // Update header weather summary
    this.elements.weatherText.textContent = 
      `${weatherData.temperature}°C, ${weatherData.conditions}, ${weatherData.windSpeed} kts ${weatherData.windDirection}`;
    
    // Update detailed weather panel
    this.elements.windValue.textContent = `${weatherData.windSpeed} kts`;
    this.elements.windDirection.textContent = weatherData.windDirection;
    this.elements.waveValue.textContent = `${weatherData.waveHeight} m`;
    this.elements.visibilityValue.textContent = `${weatherData.visibility} nm`;
    this.elements.temperatureValue.textContent = `${weatherData.temperature}°C`;
  }
  
  updateAlerts(alerts) {
    this.alerts = alerts;
    
    // Update alert count in header
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const totalCount = alerts.length;
    
    this.elements.alertCount.textContent = criticalCount > 0 ? 
      `${criticalCount} Critical, ${totalCount} Total` : 
      `${totalCount} Alerts`;
    
    this.renderAlerts();
  }
  
  renderAlerts(filter = 'all') {
    const alertsList = this.elements.alertsList;
    alertsList.innerHTML = '';
    
    let filteredAlerts = this.alerts;
    if (filter !== 'all') {
      filteredAlerts = this.alerts.filter(alert => alert.severity === filter);
    }
    
    if (filteredAlerts.length === 0) {
      alertsList.innerHTML = `
        <div class="no-alerts">
          <i class="fas fa-check-circle fa-2x"></i>
          <p>No ${filter === 'all' ? '' : filter} alerts</p>
        </div>
      `;
      return;
    }
    
    filteredAlerts.forEach(alert => {
      const alertItem = document.createElement('div');
      alertItem.className = `alert-item ${alert.severity}`;
      
      const alertTime = new Date(alert.timestamp).toLocaleTimeString();
      
      alertItem.innerHTML = `
        <div class="alert-header">
          <div class="alert-message">${alert.message}</div>
          <div class="alert-time">${alertTime}</div>
        </div>
        <div class="alert-vessel">${alert.vesselId}</div>
        ${!alert.acknowledged ? `
          <button class="alert-acknowledge" onclick="dashboard.acknowledgeAlert('${alert.id}')">
            Acknowledge
          </button>
        ` : '<div class="alert-acknowledged">✓ Acknowledged</div>'}
      `;
      
      alertsList.appendChild(alertItem);
    });
  }
  
  filterAlerts(filter) {
    this.renderAlerts(filter);
  }
  
  acknowledgeAlert(alertId) {
    // Send acknowledgment via WebSocket
    if (window.wsManager && window.wsManager.isConnected()) {
      window.wsManager.send({
        type: 'acknowledge_alert',
        alertId: alertId
      });
    }
  }
  
  showEmergencyAlert(alertData) {
    this.elements.emergencyDetails.innerHTML = `
      <div class="emergency-info">
        <h3>Vessel: ${alertData.vesselId}</h3>
        <p><strong>Type:</strong> ${alertData.emergencyType || 'Unknown'}</p>
        <p><strong>Message:</strong> ${alertData.message}</p>
        <p><strong>Time:</strong> ${new Date(alertData.timestamp).toLocaleString()}</p>
        ${alertData.location ? `
          <p><strong>Position:</strong> ${alertData.location.latitude?.toFixed(4)}°N, ${Math.abs(alertData.location.longitude).toFixed(4)}°W</p>
        ` : ''}
      </div>
    `;
    
    this.elements.emergencyModal.classList.add('show');
    
    // Auto-close after 30 seconds if not acknowledged
    setTimeout(() => {
      if (this.elements.emergencyModal.classList.contains('show')) {
        this.closeEmergencyModal();
      }
    }, 30000);
  }
  
  acknowledgeEmergency() {
    // Send emergency acknowledgment via WebSocket to ops dashboard server
    if (window.wsManager && window.wsManager.isConnected()) {
      window.wsManager.send({
        type: 'acknowledge_emergency',
        timestamp: new Date().toISOString()
      });
    }
    
    this.closeEmergencyModal();
  }
  
  closeEmergencyModal() {
    this.elements.emergencyModal.classList.remove('show');
  }
  
  updateMQTTConnectionStatus(status) {
    console.log('[MQTT] Updating MQTT connection status:', status);
    this.updateMQTTStatus(status);
  }

  hideLoading() {
    console.log('[LOADING] Attempting to hide loading screen');

    // Try multiple methods to hide the loading screen
    const overlay = this.elements.loadingOverlay || document.getElementById('loadingOverlay');

    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
      console.log('[LOADING] ✅ Loading screen hidden');
    } else {
      console.error('[LOADING] ❌ Loading overlay element not found!');
      // Fallback: try to hide by class name
      const overlayByClass = document.querySelector('.loading-overlay');
      if (overlayByClass) {
        overlayByClass.classList.add('hidden');
        overlayByClass.style.display = 'none';
        console.log('[LOADING] ✅ Loading screen hidden (fallback)');
      }
    }
  }
  
  updateHistoricalChart() {
    const chartMetric = document.getElementById('chartMetric');
    const chartRange = document.getElementById('chartRange');

    if (!chartMetric || !chartRange) {
      console.warn('Chart controls not found');
      return;
    }

    const metric = chartMetric.value || 'engine_rpm';
    const range = chartRange.value || '1h';

    if (this.selectedVessel && window.wsManager && window.wsManager.isConnected()) {
      console.log(`📊 Requesting historical data: ${this.selectedVessel} - ${metric} - ${range}`);
      window.wsManager.send({
        type: 'request_historical',
        vessel: this.selectedVessel,
        metric: metric,
        timeRange: range
      });
    } else if (window.historicalChart) {
      // Show sample data if no vessel selected or WebSocket not connected
      console.log('📊 Showing sample chart data');
      window.historicalChart.showSampleData();
    }
  }

  exportHistoricalData() {
    if (!this.selectedVessel) {
      alert('Please select a vessel first');
      return;
    }

    const range = document.getElementById('chartRange').value;
    const url = `/api/historical/${this.selectedVessel}/export?range=${range}`;

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.selectedVessel}_${range}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`📊 Exporting historical data for ${this.selectedVessel} (${range})`);
  }
}

// Global functions
function refreshFleetData() {
  if (window.wsManager && window.wsManager.isConnected()) {
    // Request fresh data
    location.reload();
  }
}

function acknowledgeEmergency() {
  window.dashboard.acknowledgeEmergency();
}

function closeEmergencyModal() {
  window.dashboard.closeEmergencyModal();
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DASHBOARD-INIT] DOM loaded, initializing dashboard');
  window.dashboard = new OperationsDashboard();
  console.log('[DASHBOARD-INIT] ✅ Dashboard initialized and available on window object');
});