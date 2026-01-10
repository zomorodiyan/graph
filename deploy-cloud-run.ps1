# Deploy to Google Cloud Run (Windows PowerShell)

# Configuration - UPDATE THESE VALUES
$PROJECT_ID = "your-project-id"  # Replace with your GCP project ID
$REGION = "us-central1"           # Choose your region
$SERVICE_NAME = "graph-app"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "🚀 Deploying Graph App to Google Cloud Run" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check if gcloud is installed
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: gcloud CLI is not installed" -ForegroundColor Red
    Write-Host "Please install it from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Set project
Write-Host "📝 Setting GCP project to: $PROJECT_ID" -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Enable required APIs
Write-Host "🔧 Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com

# Build image using Cloud Build
Write-Host "🏗️  Building Docker image..." -ForegroundColor Yellow
gcloud builds submit --tag $IMAGE_NAME -f Dockerfile.prod .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully" -ForegroundColor Green

# Deploy to Cloud Run
Write-Host "🚀 Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --platform managed `
    --region $REGION `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --timeout 300 `
    --max-instances 10 `
    --set-env-vars "PRODUCTION=true" `
    --set-secrets "config.yaml=graph-config:latest,credentials.json=graph-credentials:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Your app is now running at:" -ForegroundColor Cyan
gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
