// Maritime Engine Performance Gauges

class EngineGauges {
  constructor() {
    this.gauges = {};
    this.animationFrames = {};
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }
  
  initialize() {
    console.log('🎛️ Initializing engine gauges');
    
    // Initialize RPM gauge
    this.initializeRPMGauge();
    
    // Initialize Temperature gauge
    this.initializeTemperatureGauge();
    
    // Initialize Fuel Flow gauge
    this.initializeFuelFlowGauge();
    
    console.log('✅ Engine gauges initialized');
  }
  
  initializeRPMGauge() {
    const canvas = document.getElementById('rpmGauge');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    this.gauges.rpm = {
      canvas,
      ctx,
      centerX,
      centerY,
      radius,
      currentValue: 0,
      targetValue: 0,
      minValue: 0,
      maxValue: 2000,
      redlineValue: 1800,
      unit: 'RPM',
      color: '#3498db',
      warningColor: '#f39c12',
      dangerColor: '#e74c3c'
    };
    
    this.drawGauge('rpm');
  }
  
  initializeTemperatureGauge() {
    const canvas = document.getElementById('tempGauge');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    this.gauges.temperature = {
      canvas,
      ctx,
      centerX,
      centerY,
      radius,
      currentValue: 0,
      targetValue: 0,
      minValue: 0,
      maxValue: 120,
      redlineValue: 100,
      unit: '°C',
      color: '#27ae60',
      warningColor: '#f39c12',
      dangerColor: '#e74c3c'
    };
    
    this.drawGauge('temperature');
  }
  
  initializeFuelFlowGauge() {
    const canvas = document.getElementById('fuelGauge');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    this.gauges.fuelFlow = {
      canvas,
      ctx,
      centerX,
      centerY,
      radius,
      currentValue: 0,
      targetValue: 0,
      minValue: 0,
      maxValue: 300,
      redlineValue: 250,
      unit: 'L/h',
      color: '#9b59b6',
      warningColor: '#f39c12',
      dangerColor: '#e74c3c'
    };
    
    this.drawGauge('fuelFlow');
  }
  
  drawGauge(gaugeName) {
    const gauge = this.gauges[gaugeName];
    if (!gauge) return;
    
    const { ctx, centerX, centerY, radius, currentValue, minValue, maxValue, redlineValue } = gauge;
    
    // Clear canvas
    ctx.clearRect(0, 0, gauge.canvas.width, gauge.canvas.height);
    
    // Draw background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 10;
    ctx.stroke();
    
    // Draw tick marks
    this.drawTickMarks(gauge);
    
    // Draw scale labels
    this.drawScaleLabels(gauge);
    
    // Draw redline zone
    this.drawRedlineZone(gauge);
    
    // Draw value arc
    this.drawValueArc(gauge);
    
    // Draw needle
    this.drawNeedle(gauge);
    
    // Draw center hub
    this.drawCenterHub(gauge);
    
    // Draw digital readout
    this.drawDigitalReadout(gauge);
  }
  
  drawTickMarks(gauge) {
    const { ctx, centerX, centerY, radius, minValue, maxValue } = gauge;
    const startAngle = -Math.PI * 1.25; // Rotate dial CCW 90° (zero marking at 6:00)
    const endAngle = Math.PI * 0.25;    // End at 1:30 position
    const totalAngle = endAngle - startAngle;
    
    // Major ticks
    const majorTicks = 10;
    for (let i = 0; i <= majorTicks; i++) {
      const angle = startAngle + (totalAngle * i / majorTicks);
      const innerRadius = radius - 15;
      const outerRadius = radius - 5;
      
      const x1 = centerX + innerRadius * Math.cos(angle);
      const y1 = centerY + innerRadius * Math.sin(angle);
      const x2 = centerX + outerRadius * Math.cos(angle);
      const y2 = centerY + outerRadius * Math.sin(angle);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Minor ticks
    const minorTicks = 50;
    for (let i = 0; i <= minorTicks; i++) {
      const angle = startAngle + (totalAngle * i / minorTicks);
      const innerRadius = radius - 10;
      const outerRadius = radius - 5;
      
      const x1 = centerX + innerRadius * Math.cos(angle);
      const y1 = centerY + innerRadius * Math.sin(angle);
      const x2 = centerX + outerRadius * Math.cos(angle);
      const y2 = centerY + outerRadius * Math.sin(angle);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  
  drawScaleLabels(gauge) {
    const { ctx, centerX, centerY, radius, minValue, maxValue } = gauge;
    const startAngle = -Math.PI * 1.25; // Rotate dial CCW 90° (zero marking at 6:00)
    const endAngle = Math.PI * 0.25;    // End at 1:30 position
    const totalAngle = endAngle - startAngle;
    
    const labels = 6;
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i <= labels; i++) {
      const angle = startAngle + (totalAngle * i / labels);
      const value = Math.round(minValue + (maxValue - minValue) * i / labels);
      const labelRadius = radius - 25;
      
      const x = centerX + labelRadius * Math.cos(angle);
      const y = centerY + labelRadius * Math.sin(angle);
      
      ctx.fillText(value.toString(), x, y);
    }
  }
  
  drawRedlineZone(gauge) {
    const { ctx, centerX, centerY, radius, minValue, maxValue, redlineValue } = gauge;
    
    if (redlineValue <= minValue || redlineValue >= maxValue) return;
    
    const startAngle = -Math.PI * 1.25; // Rotate dial CCW 90° (redline zone rotated)
    const endAngle = Math.PI * 0.25;    // End at 1:30 position
    const totalAngle = endAngle - startAngle;
    
    const redlineAngle = startAngle + totalAngle * ((redlineValue - minValue) / (maxValue - minValue));
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 5, redlineAngle, endAngle);
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  
  drawValueArc(gauge) {
    const { ctx, centerX, centerY, radius, currentValue, minValue, maxValue, redlineValue } = gauge;
    
    const startAngle = -Math.PI * 1.25; // Rotate dial CCW 90° (value arc rotated)
    const endAngle = Math.PI * 0.25;    // End at 1:30 position
    const totalAngle = endAngle - startAngle;
    
    // Ensure currentValue is properly handled
    const clampedValue = Math.max(minValue, Math.min(maxValue, currentValue || 0));
    const valueRatio = (clampedValue - minValue) / (maxValue - minValue);
    const valueAngle = startAngle + totalAngle * valueRatio;
    
    // Only draw arc if there's a value greater than minimum
    if (valueRatio > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 5, startAngle, valueAngle);
      
      // Color based on value
      let color = gauge.color;
      if (clampedValue >= redlineValue) {
        color = gauge.dangerColor;
      } else if (clampedValue >= redlineValue * 0.8) {
        color = gauge.warningColor;
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.stroke();
    }
  }
  
  drawNeedle(gauge) {
    const { ctx, centerX, centerY, radius, currentValue, minValue, maxValue } = gauge;
    
    const startAngle = -Math.PI * 0.75; // Keep needle angles original (7:30 position)
    const endAngle = Math.PI * 0.75;    // Original needle range (4:30 position)
    const totalAngle = endAngle - startAngle;
    
    // Ensure currentValue is properly handled, especially when 0
    const clampedValue = Math.max(minValue, Math.min(maxValue, currentValue || 0));
    const valueRatio = (clampedValue - minValue) / (maxValue - minValue);
    const needleAngle = startAngle + totalAngle * valueRatio;
    
    const needleLength = radius - 30;
    const needleWidth = 3;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(needleAngle);
    
    // Needle
    ctx.beginPath();
    ctx.moveTo(-needleWidth, 0);
    ctx.lineTo(-needleWidth/2, -needleLength);
    ctx.lineTo(needleWidth/2, -needleLength);
    ctx.lineTo(needleWidth, 0);
    ctx.closePath();
    
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.restore();
  }
  
  drawCenterHub(gauge) {
    const { ctx, centerX, centerY } = gauge;
    
    // Outer ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#2c3e50';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Inner circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  
  drawDigitalReadout(gauge) {
    const { ctx, centerX, centerY, currentValue, unit } = gauge;
    
    // Background
    const readoutY = centerY + 40;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(centerX - 30, readoutY - 10, 60, 20);
    
    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerX - 30, readoutY - 10, 60, 20);
    
    // Value text
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Ensure proper display of zero values
    const displayValue = Math.round(currentValue || 0);
    ctx.fillText(displayValue.toString(), centerX, readoutY);
  }
  
  updateRPM(targetValue) {
    this.animateGauge('rpm', targetValue);
  }
  
  updateTemperature(targetValue) {
    this.animateGauge('temperature', targetValue);
  }
  
  updateFuelFlow(targetValue) {
    this.animateGauge('fuelFlow', targetValue);
  }
  
  animateGauge(gaugeName, targetValue) {
    const gauge = this.gauges[gaugeName];
    if (!gauge) return;
    
    // Cancel any existing animation
    if (this.animationFrames[gaugeName]) {
      cancelAnimationFrame(this.animationFrames[gaugeName]);
    }
    
    gauge.targetValue = Math.max(gauge.minValue, Math.min(gauge.maxValue, targetValue));
    
    const animate = () => {
      const diff = gauge.targetValue - gauge.currentValue;
      
      if (Math.abs(diff) < 0.5) {
        gauge.currentValue = gauge.targetValue;
        this.drawGauge(gaugeName);
        return;
      }
      
      gauge.currentValue += diff * 0.1; // Smooth animation
      this.drawGauge(gaugeName);
      
      this.animationFrames[gaugeName] = requestAnimationFrame(animate);
    };
    
    animate();
  }
  
  updateFromVessel(vessel) {
    if (vessel.engine) {
      // Ensure values default to 0 if missing or null/undefined
      this.updateRPM(Number(vessel.engine.rpm) || 0);
      this.updateTemperature(Number(vessel.engine.temperature) || 0); 
      this.updateFuelFlow(Number(vessel.engine.fuelFlow) || 0);
    } else {
      // If no engine data, reset gauges to 0
      this.updateRPM(0);
      this.updateTemperature(0);
      this.updateFuelFlow(0);
    }
  }
}

// Initialize gauges when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.engineGauges = new EngineGauges();
});