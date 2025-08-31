FROM grafana/grafana:latest

USER root

# Install Node.js for override API
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install Grafana plugins for interactive controls
RUN grafana-cli plugins install grafana-button-panel
RUN grafana-cli plugins install natel-discrete-panel
RUN grafana-cli plugins install vonage-status-panel

# Create override API directory
WORKDIR /app
COPY override-api/package*.json ./
RUN npm install

# Copy application files
COPY override-api/ ./
COPY grafana-config/ /etc/grafana/provisioning/
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set permissions
RUN chown -R grafana:grafana /var/lib/grafana
RUN chown -R grafana:grafana /etc/grafana
RUN chmod +x /app/server.js

# Switch back to grafana user
USER grafana

# Expose ports
EXPOSE 3000 8080

# Use supervisor to run both Grafana and Override API
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]