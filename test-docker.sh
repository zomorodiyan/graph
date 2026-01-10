#!/bin/bash
# Test Docker build locally before deploying

echo "🧪 Testing Docker build locally..."
echo "================================="

# Build the image
echo "📦 Building production image..."
docker build -f Dockerfile.prod -t graph-app-test . || {
    echo "❌ Build failed!"
    exit 1
}

echo "✅ Build successful!"
echo ""
echo "🚀 Starting container on http://localhost:8080..."
echo "   (Press Ctrl+C to stop)"
echo ""

# Run with local config files
docker run -p 8080:8080 \
    -v "$(pwd)/config.yaml:/app/config.yaml" \
    -v "$(pwd)/credentials.json:/app/credentials.json" \
    -e PRODUCTION=true \
    graph-app-test
