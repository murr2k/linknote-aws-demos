// BC Ferries Operations Monitoring Dashboard
// Real-time telemetry monitoring and integration with ferry control system

class FerryMonitoringDashboard {
    constructor() {
        this.ws = null;
        this.charts = {};
        this.telemetryData = new Map();
        this.alertSummary = { critical: 0, warning: 0, info: 0 };
        this.systemHealth = {
            ferryControlConnection: false,
            mqttConnection: false,
            grafanaConnection: false,
            dataSourcesActive: 0
        };
        this.connectedVessels = new Map();
        this.isConnected = false;
        
        this.init();
    }
    
    async init() {
        console.log('🚢 Initializing BC Ferries Operations Monitoring Dashboard');
        
        try {
            await this.setupWebSocket();
            await this.initializeCharts();
            await this.loadInitialData();
            this.setupEventListeners();
            this.startHealthChecks();
            this.setupGrafanaIntegration();
            
            console.log('✅ Dashboard initialized successfully');
        } catch (error) {
            console.error('❌ Dashboard initialization failed:', error);
            this.showError('Failed to initialize monitoring dashboard');
        }
    }
    
    async setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('📡 WebSocket connected to monitoring server');
            this.isConnected = true;
            this.updateConnectionStatus(true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.warn('📡 WebSocket connection closed');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    console.log('🔄 Attempting to reconnect...');
                    this.setupWebSocket();
                }
            }, 5000);
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }
    
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'initial_state':
                this.handleInitialState(message.data);
                break;
            case 'telemetry_update':
                this.handleTelemetryUpdate(message);
                break;
            case 'alert':
                this.handleAlert(message.alert);
                break;
            case 'emergency_alert':
                this.handleEmergencyAlert(message.data);
                break;
            case 'system_health':
                this.handleSystemHealth(message.data);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }
    
    handleInitialState(data) {
        console.log('📊 Received initial monitoring state:', data);
        
        this.alertSummary = data.alertSummary || { critical: 0, warning: 0, info: 0 };
        this.systemHealth = data.systemHealth || this.systemHealth;
        
        // Process connected vessels
        if (data.connectedVessels) {
            this.connectedVessels.clear();
            data.connectedVessels.forEach(([vesselId, vesselData]) => {
                this.connectedVessels.set(vesselId, vesselData);
            });
        }
        
        this.updateDashboard();
    }
    
    handleTelemetryUpdate(message) {
        const { vessel, data, timestamp } = message;
        
        if (!vessel || !data) return;
        
        // Update vessel data
        this.connectedVessels.set(vessel, {
            ...data,
            lastSeen: timestamp,
            status: 'active'
        });
        
        // Update charts with new data
        this.updateChartsWithTelemetry(vessel, data);
        
        // Update metrics
        this.updateMetrics();
        
        // Update vessel table
        this.updateVesselTable();
        
        // Update last update time
        this.updateLastUpdateTime();
    }
    
    handleAlert(alert) {
        console.warn('🚨 Alert received:', alert);
        
        // Update alert summary
        if (alert.type === 'critical') {
            this.alertSummary.critical++;
        } else if (alert.type === 'warning') {
            this.alertSummary.warning++;
        } else {
            this.alertSummary.info++;
        }
        
        // Update metrics display
        this.updateMetrics();
        
        // Show alert notification
        this.showAlertNotification(alert);
    }
    
    handleEmergencyAlert(alertData) {
        console.error('🚨 EMERGENCY ALERT:', alertData);
        
        // Show emergency alert bar
        const alertBar = document.getElementById('alertBar');
        const alertMessage = document.getElementById('alertMessage');
        
        alertMessage.textContent = `🚨 EMERGENCY: ${alertData.message} - Vessel ${alertData.vesselId}`;
        alertBar.classList.add('show');
        
        // Auto-hide after 30 seconds
        setTimeout(() => {
            alertBar.classList.remove('show');
        }, 30000);
        
        // Update system status
        this.updateSystemStatus('critical', 'Emergency Alert Active');
    }
    
    handleSystemHealth(healthData) {
        this.systemHealth = { ...this.systemHealth, ...healthData };
        this.updateSystemHealthDisplay();
    }
    
    async initializeCharts() {
        console.log('📊 Initializing monitoring charts');
        
        // Engine Performance Chart
        const engineCtx = document.getElementById('engineChart');
        if (engineCtx) {
            this.charts.engine = new Chart(engineCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Engine RPM',
                            data: [],
                            borderColor: '#003f7f',
                            backgroundColor: 'rgba(0, 63, 127, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Temperature (°C)',
                            data: [],
                            borderColor: '#fd7e14',
                            backgroundColor: 'rgba(253, 126, 20, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'RPM' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'Temperature (°C)' },
                            grid: { drawOnChartArea: false }
                        }
                    },
                    plugins: {
                        title: { display: true, text: 'Engine Performance Monitoring' },
                        legend: { display: true }
                    }
                }
            });
        }
        
        // Power Systems Chart
        const powerCtx = document.getElementById('powerChart');
        if (powerCtx) {
            this.charts.power = new Chart(powerCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Battery SOC (%)',
                            data: [],
                            borderColor: '#28a745',
                            backgroundColor: 'rgba(40, 167, 69, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Generator Load (%)',
                            data: [],
                            borderColor: '#ffc107',
                            backgroundColor: 'rgba(255, 193, 7, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            title: { display: true, text: 'Percentage (%)' }
                        }
                    },
                    plugins: {
                        title: { display: true, text: 'Power Systems Monitoring' },
                        legend: { display: true }
                    }
                }
            });
        }
        
        // Safety Systems Chart
        const safetyCtx = document.getElementById('safetyChart');
        if (safetyCtx) {
            this.charts.safety = new Chart(safetyCtx, {
                type: 'bar',
                data: {
                    labels: ['Fire Alarm', 'Bilge Level', 'CO₂ Level'],
                    datasets: [{
                        label: 'Safety Status',
                        data: [0, 0, 400],
                        backgroundColor: [
                            'rgba(40, 167, 69, 0.8)',
                            'rgba(0, 63, 127, 0.8)',
                            'rgba(108, 117, 125, 0.8)'
                        ],
                        borderColor: [
                            '#28a745',
                            '#003f7f',
                            '#6c757d'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Safety Systems Status' },
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Level/Status' }
                        }
                    }
                }
            });
        }
        
        // Navigation Chart
        const navCtx = document.getElementById('navigationChart');
        if (navCtx) {
            this.charts.navigation = new Chart(navCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Speed (knots)',
                            data: [],
                            borderColor: '#006994',
                            backgroundColor: 'rgba(0, 105, 148, 0.1)',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            title: { display: true, text: 'Speed (knots)' }
                        }
                    },
                    plugins: {
                        title: { display: true, text: 'Navigation Data' },
                        legend: { display: true }
                    }
                }
            });
        }
    }
    
    updateChartsWithTelemetry(vesselId, data) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        // Update engine chart
        if (this.charts.engine && data.engine) {
            const engineChart = this.charts.engine;
            engineChart.data.labels.push(timeLabel);
            engineChart.data.datasets[0].data.push(data.engine.rpm || 0);
            engineChart.data.datasets[1].data.push(data.engine.temperature || 0);
            
            // Keep only last 20 data points
            if (engineChart.data.labels.length > 20) {
                engineChart.data.labels.shift();
                engineChart.data.datasets[0].data.shift();
                engineChart.data.datasets[1].data.shift();
            }
            
            engineChart.update('none');
        }
        
        // Update power chart
        if (this.charts.power && data.power) {
            const powerChart = this.charts.power;
            powerChart.data.labels.push(timeLabel);
            powerChart.data.datasets[0].data.push(data.power.batterySOC || 0);
            powerChart.data.datasets[1].data.push(data.power.generatorLoad || 0);
            
            if (powerChart.data.labels.length > 20) {
                powerChart.data.labels.shift();
                powerChart.data.datasets[0].data.shift();
                powerChart.data.datasets[1].data.shift();
            }
            
            powerChart.update('none');
        }
        
        // Update safety chart
        if (this.charts.safety && data.safety) {
            const safetyChart = this.charts.safety;
            safetyChart.data.datasets[0].data = [
                data.safety.fireAlarm ? 1 : 0,
                data.safety.bilgeLevel || 0,
                data.safety.co2Level || 400
            ];
            
            // Update colors based on status
            safetyChart.data.datasets[0].backgroundColor = [
                data.safety.fireAlarm ? 'rgba(220, 53, 69, 0.8)' : 'rgba(40, 167, 69, 0.8)',
                data.safety.bilgeLevel > 70 ? 'rgba(220, 53, 69, 0.8)' : 'rgba(0, 63, 127, 0.8)',
                data.safety.co2Level > 1000 ? 'rgba(220, 53, 69, 0.8)' : 'rgba(108, 117, 125, 0.8)'
            ];
            
            safetyChart.update('none');
        }
        
        // Update navigation chart
        if (this.charts.navigation && data.navigation) {
            const navChart = this.charts.navigation;
            navChart.data.labels.push(timeLabel);
            navChart.data.datasets[0].data.push(data.navigation.speed || 0);
            
            if (navChart.data.labels.length > 20) {
                navChart.data.labels.shift();
                navChart.data.datasets[0].data.shift();
            }
            
            navChart.update('none');
        }
    }
    
    updateMetrics() {
        // Update connected vessels count
        const vesselCount = document.getElementById('vesselCount');
        if (vesselCount) {
            vesselCount.textContent = this.connectedVessels.size;
        }
        
        // Update alert counts
        const criticalCount = document.getElementById('criticalCount');
        if (criticalCount) {
            criticalCount.textContent = this.alertSummary.critical;
            
            const criticalCard = document.getElementById('criticalAlerts');
            if (this.alertSummary.critical > 0) {
                criticalCard.classList.add('critical');
            } else {
                criticalCard.classList.remove('critical');
            }
        }
        
        const warningCount = document.getElementById('warningCount');
        if (warningCount) {
            warningCount.textContent = this.alertSummary.warning;
            
            const warningCard = document.getElementById('warningAlerts');
            if (this.alertSummary.warning > 0) {
                warningCard.classList.add('warning');
            } else {
                warningCard.classList.remove('warning');
            }
        }
        
        // Update system health score
        const healthScore = document.getElementById('healthScore');
        if (healthScore) {
            const score = Math.round((this.systemHealth.dataSourcesActive / 3) * 100);
            healthScore.textContent = `${score}%`;
            
            const healthCard = document.getElementById('systemHealth');
            if (score < 50) {
                healthCard.classList.add('critical');
                healthCard.classList.remove('warning');
            } else if (score < 80) {
                healthCard.classList.add('warning');
                healthCard.classList.remove('critical');
            } else {
                healthCard.classList.remove('critical', 'warning');
            }
        }
    }
    
    updateVesselTable() {
        const tableBody = document.getElementById('vesselTableBody');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        if (this.connectedVessels.size === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary);">
                        No vessels currently connected
                    </td>
                </tr>
            `;
            return;
        }
        
        this.connectedVessels.forEach((vesselData, vesselId) => {
            const row = document.createElement('tr');
            const lastSeen = new Date(vesselData.lastSeen);
            const timeSince = Math.round((Date.now() - lastSeen.getTime()) / 1000);
            
            let statusClass = 'active';
            let statusText = 'Active';
            
            if (timeSince > 300) { // 5 minutes
                statusClass = 'offline';
                statusText = 'Offline';
            } else if (timeSince > 120) { // 2 minutes
                statusClass = 'warning';
                statusText = 'Warning';
            }
            
            row.innerHTML = `
                <td>${vesselId}</td>
                <td><span class="vessel-status ${statusClass}">${statusText}</span></td>
                <td>${vesselData.navigation?.route || 'Unknown'}</td>
                <td>${timeSince < 60 ? `${timeSince}s ago` : `${Math.round(timeSince/60)}m ago`}</td>
            `;
            
            tableBody.appendChild(row);
        });
    }
    
    updateSystemHealthDisplay() {
        // Update connection status indicators
        const ferryControlStatus = document.getElementById('ferryControlStatus');
        if (ferryControlStatus) {
            ferryControlStatus.innerHTML = this.systemHealth.ferryControlConnection 
                ? '🟢 Connected' 
                : '🔴 Disconnected';
        }
        
        const mqttStatus = document.getElementById('mqttStatus');
        if (mqttStatus) {
            mqttStatus.innerHTML = this.systemHealth.mqttConnection 
                ? '🟢 Connected' 
                : '🔴 Disconnected';
        }
        
        const grafanaStatus = document.getElementById('grafanaStatus');
        if (grafanaStatus) {
            grafanaStatus.innerHTML = this.systemHealth.grafanaConnection 
                ? '🟢 Connected' 
                : '🔴 Disconnected';
        }
    }
    
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('systemStatusIndicator');
        const statusText = document.getElementById('systemStatusText');
        
        if (connected) {
            indicator.className = 'status-indicator';
            statusText.textContent = 'System Operational';
        } else {
            indicator.className = 'status-indicator critical';
            statusText.textContent = 'Connection Lost';
        }
    }
    
    updateSystemStatus(level, message) {
        const indicator = document.getElementById('systemStatusIndicator');
        const statusText = document.getElementById('systemStatusText');
        
        indicator.className = `status-indicator ${level}`;
        statusText.textContent = message;
    }
    
    updateLastUpdateTime() {
        const lastUpdate = document.getElementById('lastUpdateTime');
        if (lastUpdate) {
            lastUpdate.textContent = `Last Update: ${new Date().toLocaleTimeString()}`;
        }
    }
    
    setupGrafanaIntegration() {
        // Set up Grafana iframe with proper URL
        const grafanaFrame = document.getElementById('grafanaFrame');
        if (grafanaFrame) {
            // Use environment variable or default
            const grafanaUrl = window.GRAFANA_URL || 'https://bcferriesdemo.grafana.net';
            const dashboardId = 'bc-ferries-maritime-ops';
            
            grafanaFrame.src = `${grafanaUrl}/d/${dashboardId}/bc-ferries-maritime-operations?orgId=1&refresh=5s&kiosk=true`;
        }
    }
    
    async loadInitialData() {
        try {
            console.log('📊 Loading initial monitoring data...');
            
            // Load monitoring state
            const stateResponse = await fetch('/api/monitoring/state');
            if (stateResponse.ok) {
                const stateData = await stateResponse.json();
                this.handleInitialState(stateData);
            }
            
            // Load vessel data
            const vesselResponse = await fetch('/api/vessels');
            if (vesselResponse.ok) {
                const vesselData = await vesselResponse.json();
                console.log('🚢 Loaded vessel data:', vesselData);
            }
            
            // Check system health
            const healthResponse = await fetch('/api/health');
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                console.log('💚 System health:', healthData);
                this.systemHealth = healthData.monitoring.systemHealth;
                this.updateSystemHealthDisplay();
            }
            
        } catch (error) {
            console.error('❌ Failed to load initial data:', error);
        }
    }
    
    setupEventListeners() {
        // Refresh button
        window.refreshData = () => {
            this.loadInitialData();
            console.log('🔄 Data refreshed');
        };
        
        // Download report button
        window.downloadReport = () => {
            this.generateReport();
        };
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.loadInitialData();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.generateReport();
                        break;
                }
            }
        });
    }
    
    startHealthChecks() {
        // Check ferry control system health every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/ferry-control/health');
                this.systemHealth.ferryControlConnection = response.ok;
            } catch (error) {
                this.systemHealth.ferryControlConnection = false;
            }
            this.updateSystemHealthDisplay();
        }, 30000);
    }
    
    showAlertNotification(alert) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert-notification ${alert.type}`;
        notification.innerHTML = `
            <div class="alert-content">
                <strong>${alert.type.toUpperCase()}:</strong> ${alert.message}
                <br><small>Vessel: ${alert.vesselId} | System: ${alert.system}</small>
            </div>
            <button onclick="this.parentElement.remove()" class="alert-close">×</button>
        `;
        
        // Add styles if not already present
        if (!document.getElementById('alertStyles')) {
            const styles = document.createElement('style');
            styles.id = 'alertStyles';
            styles.textContent = `
                .alert-notification {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    background: white;
                    border-radius: 6px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    padding: 1rem;
                    max-width: 400px;
                    z-index: 1000;
                    border-left: 4px solid;
                    animation: slideIn 0.3s ease-out;
                }
                .alert-notification.critical { border-left-color: #dc3545; }
                .alert-notification.warning { border-left-color: #ffc107; }
                .alert-close {
                    position: absolute;
                    top: 0.5rem;
                    right: 0.5rem;
                    background: none;
                    border: none;
                    font-size: 1.2rem;
                    cursor: pointer;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }
    
    showError(message) {
        console.error('❌ Dashboard Error:', message);
        // Could implement toast notifications here
    }
    
    generateReport() {
        const reportData = {
            timestamp: new Date().toISOString(),
            systemHealth: this.systemHealth,
            connectedVessels: Array.from(this.connectedVessels.entries()),
            alertSummary: this.alertSummary,
            dashboardUrl: window.location.href
        };
        
        const reportJson = JSON.stringify(reportData, null, 2);
        const blob = new Blob([reportJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ferry-monitoring-report-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📋 Report generated and downloaded');
    }
    
    updateDashboard() {
        this.updateMetrics();
        this.updateVesselTable();
        this.updateSystemHealthDisplay();
        this.updateLastUpdateTime();
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚢 Starting BC Ferries Operations Monitoring Dashboard...');
    window.dashboard = new FerryMonitoringDashboard();
});

// Global error handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});