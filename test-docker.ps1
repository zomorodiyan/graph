# Test Docker build locally before deploying (Windows)

Write-Host "🧪 Testing Docker build locally..." -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Build the image
Write-Host "📦 Building production image..." -ForegroundColor Yellow
docker build -f Dockerfile.prod -t graph-app-test .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Starting container on http://localhost:8080..." -ForegroundColor Cyan
Write-Host "   (Press Ctrl+C to stop)" -ForegroundColor Yellow
Write-Host ""

# Run with local config files
docker run -p 8080:8080 `
    -v "${PWD}/config.yaml:/app/config.yaml" `
    -v "${PWD}/credentials.json:/app/credentials.json" `
    -e PRODUCTION=true `
    graph-app-test
