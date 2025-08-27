#!/bin/bash

# OBTV Studio Manager Deployment Script
# This script helps deploy the application on Ubuntu with Docker

set -e

echo "🚀 OBTV Studio Manager Deployment Script"
echo "=========================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Docker if not present
if ! command_exists docker; then
    echo "📦 Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    sudo usermod -aG docker $USER
    echo "✅ Docker installed successfully"
else
    echo "✅ Docker is already installed"
fi

# Install Docker Compose if not present
if ! command_exists docker-compose; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed successfully"
else
    echo "✅ Docker Compose is already installed"
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file and set the following variables:"
    echo "   - POSTGRES_PASSWORD (required)"
    echo "   - SESSION_SECRET (required, minimum 32 characters)"
    echo "   - REPL_ID (if using Replit auth)"
    echo "   - REPLIT_DOMAINS (if using Replit auth)"
    echo ""
    echo "📝 Opening .env file for editing..."
    ${EDITOR:-nano} .env
else
    echo "✅ Environment file already exists"
fi

# Create logs directory
mkdir -p logs

# Create SSL directory for nginx (optional)
mkdir -p ssl

# Pull the latest images
echo "📥 Pulling Docker images..."
docker-compose pull

# Build the application
echo "🔨 Building OBTV Studio Manager..."
docker-compose build --no-cache

# Start the services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."
if docker-compose ps | grep -q "Up.*healthy"; then
    echo "✅ All services are running and healthy"
else
    echo "⚠️  Some services might not be healthy yet. Check with: docker-compose ps"
fi

# Display running services
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Check that all services are running: docker-compose ps"
echo "2. View logs: docker-compose logs -f"
echo "3. Access the application at: http://localhost (or your server IP)"
echo "4. For HTTPS, configure SSL certificates in the ssl/ directory"
echo ""
echo "🔧 Useful commands:"
echo "   Start services:    docker-compose up -d"
echo "   Stop services:     docker-compose down"
echo "   View logs:         docker-compose logs -f [service_name]"
echo "   Restart service:   docker-compose restart [service_name]"
echo "   Update app:        docker-compose up -d --build obtv_app"
echo ""