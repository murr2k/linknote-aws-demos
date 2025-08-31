// WebSocket Manager for Real-time Communications

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.isManualClose = false;
    
    this.connect();
  }
  
  connect() {
    try {
      // Determine WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      console.log('🔗 Connecting to WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
      
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.scheduleReconnect();
    }
  }
  
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Update dashboard connection status
      if (window.dashboard) {
        window.dashboard.updateConnectionStatus('connected');
        window.dashboard.hideLoading();
      }
      
      // Start heartbeat
      this.startHeartbeat();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error, event.data);
      }
    };
    
    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected', event.code, event.reason);
      
      // Update dashboard connection status
      if (window.dashboard) {
        window.dashboard.updateConnectionStatus('disconnected');
      }
      
      // Stop heartbeat
      this.stopHeartbeat();
      
      // Attempt to reconnect unless manually closed
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      
      if (window.dashboard) {
        window.dashboard.updateConnectionStatus('disconnected');
      }
    };
  }
  
  handleMessage(message) {
    console.log('📨 Received message:', message.type);
    
    if (!window.dashboard) {
      console.warn('Dashboard not initialized yet');
      return;
    }
    
    switch (message.type) {
      case 'initial_data':
        this.handleInitialData(message.data);
        break;
        
      case 'vessel_update':
        this.handleVesselUpdate(message.data);
        break;
        
      case 'new_alert':
        this.handleNewAlert(message.data);
        break;
        
      case 'emergency_alert':
        this.handleEmergencyAlert(message.data);
        break;
        
      case 'weather_update':
        window.dashboard.updateWeather(message.data);
        break;
        
      case 'system_status':
        window.dashboard.systemStatus = message.data;
        break;
        
      case 'alert_acknowledged':
        this.handleAlertAcknowledged(message.data);
        break;
        
      case 'historical_data':
        this.handleHistoricalData(message.data);
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }
  
  handleInitialData(data) {
    console.log('🔄 Processing initial data');
    
    // Process fleet data
    if (data.fleet) {
      window.dashboard.vessels.clear();
      data.fleet.forEach(vessel => {
        window.dashboard.vessels.set(vessel.id, vessel);
      });
      window.dashboard.updateFleetOverview();
    }
    
    // Process alerts
    if (data.alerts) {
      window.dashboard.updateAlerts(data.alerts);
    }
    
    // Process weather
    if (data.weatherData) {
      window.dashboard.updateWeather(data.weatherData);
    }
    
    // Process system status
    if (data.systemStatus) {
      window.dashboard.systemStatus = data.systemStatus;
    }
    
    console.log('✅ Initial data processed');
  }
  
  handleVesselUpdate(data) {
    const { vesselId, vessel } = data;
    
    // Update vessel in dashboard
    window.dashboard.vessels.set(vesselId, vessel);
    window.dashboard.updateFleetOverview();
    
    // If this is the selected vessel, update detail view
    if (window.dashboard.selectedVessel === vesselId) {
      window.dashboard.selectVessel(vesselId);
    }
    
    // Update engine gauges if this vessel is selected
    if (window.engineGauges && window.dashboard.selectedVessel === vesselId) {
      window.engineGauges.updateFromVessel(vessel);
    }
  }
  
  handleNewAlert(alertData) {
    // Check for duplicate alert (idempotency)
    const isDuplicate = window.dashboard.alerts.some(existingAlert => 
      existingAlert.id === alertData.id || 
      (existingAlert.vesselId === alertData.vesselId && 
       existingAlert.alertType === alertData.alertType &&
       !existingAlert.acknowledged)
    );

    if (isDuplicate) {
      console.log('🔄 Duplicate alert ignored:', alertData.id || alertData.alertType);
      return;
    }

    // Add to alerts list
    window.dashboard.alerts.unshift(alertData);
    
    // Keep only last 100 alerts
    if (window.dashboard.alerts.length > 100) {
      window.dashboard.alerts = window.dashboard.alerts.slice(0, 100);
    }
    
    // Update alerts display
    window.dashboard.updateAlerts(window.dashboard.alerts);
    
    // Show notification for critical alerts
    if (alertData.severity === 'critical') {
      this.showAlertNotification(alertData);
    }
  }
  
  handleEmergencyAlert(alertData) {
    console.log('🚨 Emergency alert received:', alertData);
    
    // Add to alerts
    this.handleNewAlert(alertData);
    
    // Show emergency modal
    window.dashboard.showEmergencyAlert(alertData);
    
    // Play alert sound (if available)
    this.playAlertSound();
  }
  
  handleAlertAcknowledged(data) {
    const { alertId, alertType, vesselId, acknowledgedAt } = data;
    
    // Update or find alert in dashboard - support both ID and type-based matching
    let alert = window.dashboard.alerts.find(a => a.id === alertId);
    
    // If no ID match, find by alert type and vessel (for legacy compatibility)
    if (!alert && alertType && vesselId) {
      alert = window.dashboard.alerts.find(a => 
        a.alertType === alertType && 
        a.vesselId === vesselId && 
        !a.acknowledged
      );
    }
    
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = acknowledgedAt || new Date().toISOString();
      
      console.log('✅ Alert acknowledged:', alert.id || `${alert.vesselId}_${alert.alertType}`);
      
      // Re-render alerts
      window.dashboard.updateAlerts(window.dashboard.alerts);
    }
  }
  
  handleHistoricalData(data) {
    if (window.historicalChart) {
      window.historicalChart.updateChart(data);
    }
  }
  
  showAlertNotification(alertData) {
    // Create browser notification if supported and permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('BC Ferries Alert', {
        body: `${alertData.vesselId}: ${alertData.message}`,
        icon: '/favicon.ico',
        tag: alertData.id
      });
    }
    
    // Visual notification in UI
    const notification = document.createElement('div');
    notification.className = 'alert-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas fa-exclamation-triangle"></i>
        <div>
          <strong>${alertData.vesselId}</strong>
          <p>${alertData.message}</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }
  
  playAlertSound() {
    // Try to play alert sound (most browsers require user interaction first)
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmceBS2Sx/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmceBTCWyfLkdysCAA==');
      audio.play().catch(() => {
        // Silently fail if audio can't be played
      });
    } catch (error) {
      // Ignore audio errors
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (window.dashboard) {
        window.dashboard.updateConnectionStatus('disconnected');
      }
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    if (window.dashboard) {
      window.dashboard.updateConnectionStatus('connecting');
    }
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 30000); // 30 second heartbeat
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  send(data) {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }
  
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
  
  close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Request notification permissions
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Initialize WebSocket manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.wsManager = new WebSocketManager();
  requestNotificationPermission();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.wsManager) {
    window.wsManager.close();
  }
});