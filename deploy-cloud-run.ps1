# Deploy to Google Cloud Run (Windows PowerShell)

# Configuration
$PROJECT_ID = "zomograph-personal"  # Your existing GCP project
$REGION = "us-central1"            # Your region
$SERVICE_NAME = "graph-api"         # Your existing service name
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "Deploying Graph App to Google Cloud Run" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if gcloud is installed
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] gcloud CLI is not installed" -ForegroundColor Red
    Write-Host "Please install it from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Set project
Write-Host "[INFO] Setting GCP project to: $PROJECT_ID" -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Enable required APIs
Write-Host "[INFO] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com

# Build image using Cloud Build with multi-stage Dockerfile
Write-Host "[INFO] Building Docker image with frontend..." -ForegroundColor Yellow
gcloud builds submit --config cloudbuild.yaml --substitutions=TAG_NAME=$IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "[SUCCESS] Build completed" -ForegroundColor Green

# Deploy to Cloud Run
Write-Host "[INFO] Deploying to Cloud Run..." -ForegroundColor Yellow
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
    --set-secrets "/secrets/config/config.yaml=graph-config:latest,/secrets/token/token.pickle=graph-token:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[SUCCESS] Deployment completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Your app is now running at:" -ForegroundColor Cyan
gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
