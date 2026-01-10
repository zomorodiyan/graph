#!/bin/bash
# Deploy to Google Cloud Run

# Configuration
PROJECT_ID="your-project-id"  # Replace with your GCP project ID
REGION="us-central1"           # Choose your region
SERVICE_NAME="graph-app"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Graph App to Google Cloud Run"
echo "============================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "📝 Setting GCP project to: ${PROJECT_ID}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    secretmanager.googleapis.com

# Build image using Cloud Build
echo "🏗️  Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME} -f Dockerfile.prod .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed successfully"

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --max-instances 10 \
    --set-env-vars "PRODUCTION=true" \
    --set-secrets "config.yaml=graph-config:latest,credentials.json=graph-credentials:latest"

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Your app is now running at:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)'
