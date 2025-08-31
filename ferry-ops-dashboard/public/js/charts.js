// Historical Data Charts for Operations Dashboard

class HistoricalCharts {
  constructor() {
    this.chart = null;
    this.chartConfig = {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Value',
          data: [],
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: {
                family: 'Inter, sans-serif'
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(44, 62, 80, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#3498db',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                hour: 'HH:mm',
                day: 'MMM DD'
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#ffffff',
              font: {
                family: 'Inter, sans-serif'
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: '#ffffff',
              font: {
                family: 'Inter, sans-serif'
              }
            }
          }
        }
      }
    };
    
    this.initialize();
  }
  
  initialize() {
    const canvas = document.getElementById('historicalChart');
    if (!canvas) {
      console.warn('Historical chart canvas not found');
      return;
    }
    
    // Initialize with Chart.js
    this.chart = new Chart(canvas.getContext('2d'), this.chartConfig);
    
    console.log('📊 Historical charts initialized');
  }
  
  updateChart(data) {
    if (!this.chart) {
      console.warn('Chart not initialized');
      return;
    }
    
    const { metric, timeRange, data: chartData } = data;
    
    // Update chart title and styling based on metric
    const metricConfig = this.getMetricConfig(metric);
    
    // Prepare data
    const labels = chartData.map(point => new Date(point.timestamp));
    const values = chartData.map(point => point.value);
    
    // Update chart data
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].label = metricConfig.label;
    this.chart.data.datasets[0].data = values;
    this.chart.data.datasets[0].borderColor = metricConfig.color;
    this.chart.data.datasets[0].backgroundColor = metricConfig.backgroundColor;
    
    // Update Y-axis configuration
    this.chart.options.scales.y.min = metricConfig.min;
    this.chart.options.scales.y.max = metricConfig.max;
    
    // Add threshold lines if applicable
    if (metricConfig.thresholds) {
      this.addThresholdLines(metricConfig.thresholds);
    }
    
    // Update chart
    this.chart.update();
    
    console.log(`📈 Chart updated for ${metric} (${timeRange})`);
  }
  
  getMetricConfig(metric) {
    const configs = {
      fuel_efficiency: {
        label: 'Fuel Efficiency (L/nm)',
        color: '#9b59b6',
        backgroundColor: 'rgba(155, 89, 182, 0.1)',
        min: 8,
        max: 20,
        thresholds: [
          { value: 15, color: '#f39c12', label: 'Target' }
        ]
      },
      engine_temperature: {
        label: 'Engine Temperature (°C)',
        color: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        min: 60,
        max: 120,
        thresholds: [
          { value: 100, color: '#e74c3c', label: 'Max Operating' },
          { value: 90, color: '#f39c12', label: 'Warning' }
        ]
      },
      battery_soc: {
        label: 'Battery State of Charge (%)',
        color: '#27ae60',
        backgroundColor: 'rgba(39, 174, 96, 0.1)',
        min: 0,
        max: 100,
        thresholds: [
          { value: 20, color: '#e74c3c', label: 'Low' },
          { value: 40, color: '#f39c12', label: 'Caution' }
        ]
      },
      passenger_count: {
        label: 'Passenger Count',
        color: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        min: 0,
        max: 200,
        thresholds: [
          { value: 150, color: '#f39c12', label: 'Near Capacity' }
        ]
      }
    };
    
    return configs[metric] || {
      label: 'Value',
      color: '#3498db',
      backgroundColor: 'rgba(52, 152, 219, 0.1)',
      min: undefined,
      max: undefined
    };
  }
  
  addThresholdLines(thresholds) {
    // Remove existing threshold annotations
    if (this.chart.options.plugins.annotation) {
      this.chart.options.plugins.annotation.annotations = {};
    } else {
      this.chart.options.plugins.annotation = { annotations: {} };
    }
    
    thresholds.forEach((threshold, index) => {
      this.chart.options.plugins.annotation.annotations[`threshold_${index}`] = {
        type: 'line',
        yMin: threshold.value,
        yMax: threshold.value,
        borderColor: threshold.color,
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
          content: threshold.label,
          enabled: true,
          position: 'end',
          backgroundColor: threshold.color,
          color: '#ffffff',
          font: {
            size: 10,
            family: 'Inter, sans-serif'
          }
        }
      };
    });
  }
  
  setTimeRange(range) {
    if (!this.chart) return;
    
    // Update X-axis time display format based on range
    let displayFormat;
    switch (range) {
      case '24h':
        displayFormat = 'HH:mm';
        break;
      case '7d':
        displayFormat = 'MMM DD';
        break;
      case '30d':
        displayFormat = 'MMM DD';
        break;
      default:
        displayFormat = 'HH:mm';
    }
    
    this.chart.options.scales.x.time.displayFormats = {
      hour: displayFormat,
      day: displayFormat
    };
    
    this.chart.update();
  }
  
  generateSampleData(metric, range) {
    const points = range === '24h' ? 24 : range === '7d' ? 168 : 720; // Hours
    const data = [];
    
    const now = new Date();
    
    for (let i = points; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
      
      let value;
      const baseTime = timestamp.getHours() + (timestamp.getMinutes() / 60);
      
      switch (metric) {
        case 'fuel_efficiency':
          // Simulate fuel efficiency varying with time of day and operational patterns
          value = 12 + Math.sin(baseTime * Math.PI / 12) * 2 + (Math.random() - 0.5) * 2;
          break;
          
        case 'engine_temperature':
          // Temperature varies with operation and ambient temperature
          value = 75 + Math.sin(baseTime * Math.PI / 12) * 10 + (Math.random() - 0.5) * 8;
          break;
          
        case 'battery_soc':
          // Battery SOC follows charging/discharging cycles
          const cyclePosition = (baseTime % 4) / 4; // 4-hour cycles
          value = 50 + Math.sin(cyclePosition * 2 * Math.PI) * 30 + (Math.random() - 0.5) * 10;
          value = Math.max(10, Math.min(95, value));
          break;
          
        case 'passenger_count':
          // Passenger count varies by time of day (higher during commute hours)
          const isRushHour = (baseTime >= 7 && baseTime <= 9) || (baseTime >= 17 && baseTime <= 19);
          value = isRushHour ? 
            100 + Math.random() * 80 : 
            30 + Math.random() * 60;
          value = Math.floor(value);
          break;
          
        default:
          value = Math.random() * 100;
      }
      
      data.push({
        timestamp: timestamp.toISOString(),
        value: Math.round(value * 100) / 100
      });
    }
    
    return data;
  }
  
  showSampleData() {
    // Show sample data for demonstration
    const sampleData = {
      vessel: 'island-class-001',
      metric: 'fuel_efficiency',
      timeRange: '24h',
      data: this.generateSampleData('fuel_efficiency', '24h')
    };
    
    this.updateChart(sampleData);
  }
}

// Mini chart widgets for dashboard panels
class MiniChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.data = options.data || [];
    this.color = options.color || '#3498db';
    this.maxPoints = options.maxPoints || 50;
    
    this.draw();
  }
  
  addDataPoint(value) {
    this.data.push(value);
    
    // Keep only the last N points
    if (this.data.length > this.maxPoints) {
      this.data.shift();
    }
    
    this.draw();
  }
  
  draw() {
    const { ctx, width, height, data } = this;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (data.length < 2) return;
    
    // Calculate min/max for scaling
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    
    data.forEach((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw fill area
    if (data.length > 1) {
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = this.color.replace(')', ', 0.2)').replace('rgb', 'rgba');
      ctx.fill();
    }
  }
  
  updateData(newData) {
    this.data = newData.slice(-this.maxPoints);
    this.draw();
  }
}

// Initialize charts when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize main historical chart
  window.historicalChart = new HistoricalCharts();
  
  // Show sample data initially
  setTimeout(() => {
    if (window.historicalChart) {
      window.historicalChart.showSampleData();
    }
  }, 1000);
});