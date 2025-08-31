#!/bin/bash

# BC Ferries Operations Dashboard Deployment Script

set -e

echo "🚢 BC Ferries Operations Dashboard Deployment"
echo "=============================================="

# Check if Fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Please install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "❌ Not logged in to Fly.io. Please run:"
    echo "   fly auth login"
    exit 1
fi

echo "📋 Pre-deployment checks..."

# Validate package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi

# Validate Dockerfile
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found"
    exit 1
fi

# Validate fly.toml
if [ ! -f "fly.toml" ]; then
    echo "❌ fly.toml not found"
    exit 1
fi

echo "✅ All required files present"

# Check if app exists
APP_NAME="bc-ferries-ops-dashboard"
if fly apps list | grep -q "$APP_NAME"; then
    echo "📱 App $APP_NAME exists, deploying update..."
else
    echo "🆕 Creating new app $APP_NAME..."
    fly apps create "$APP_NAME" --org personal
fi

# Set environment variables if they don't exist
echo "🔧 Setting environment variables..."
fly secrets set NODE_ENV=production --app "$APP_NAME" 2>/dev/null || echo "   NODE_ENV already set"
fly secrets set FERRY_CONTROL_API=https://ferry.linknote.com --app "$APP_NAME" 2>/dev/null || echo "   FERRY_CONTROL_API already set"
fly secrets set FERRY_CONTROL_WS=wss://ferry.linknote.com --app "$APP_NAME" 2>/dev/null || echo "   FERRY_CONTROL_WS already set"

echo "🚀 Deploying to Fly.io..."
fly deploy --app "$APP_NAME"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🌐 Your operations dashboard is available at:"
    echo "   https://$APP_NAME.fly.dev"
    echo ""
    echo "📊 To check status:"
    echo "   fly status --app $APP_NAME"
    echo ""
    echo "📝 To view logs:"
    echo "   fly logs --app $APP_NAME"
    echo ""
    echo "🏥 Health check:"
    echo "   curl https://$APP_NAME.fly.dev/health"
    echo ""
    
    # Wait a moment and check health
    echo "⏳ Checking health endpoint..."
    sleep 10
    
    if curl -f "https://$APP_NAME.fly.dev/health" > /dev/null 2>&1; then
        echo "✅ Health check passed"
        echo ""
        echo "🎉 Operations dashboard is ready!"
        echo "   Navigate to https://$APP_NAME.fly.dev to view the dashboard"
    else
        echo "⚠️  Health check failed, but deployment completed"
        echo "   Check logs: fly logs --app $APP_NAME"
    fi
else
    echo "❌ Deployment failed"
    exit 1
fi