# Deploying to Google Cloud Run

This guide walks you through deploying the Hierarchical Graph API to Google Cloud Run.

## Prerequisites

1. **Google Cloud SDK** installed: https://cloud.google.com/sdk/docs/install
2. **Docker** installed (optional, for local testing)
3. A Google Cloud project with billing enabled

## Setup Steps

### 1. Set Up Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Set your project (create one at console.cloud.google.com if needed)
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 2. Store Secrets in Google Secret Manager

Your app needs access to Google Drive. Store your credentials securely:

```bash
# Store the OAuth token (from token.pickle, base64 encoded)
# First, encode your token.pickle:
python -c "import base64; print(base64.b64encode(open('token.pickle', 'rb').read()).decode())" > token_base64.txt

# Create the secret
gcloud secrets create graph-token --data-file=token_base64.txt

# Clean up
rm token_base64.txt

# Store the config.yaml
gcloud secrets create graph-config --data-file=config.yaml
```

### 3. Create a Service Account

```bash
# Create service account for Cloud Run
gcloud iam service-accounts create graph-api-sa \
    --display-name="Graph API Service Account"

# Grant access to secrets
gcloud secrets add-iam-policy-binding graph-token \
    --member="serviceAccount:graph-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding graph-config \
    --member="serviceAccount:graph-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 4. Deploy to Cloud Run

```bash
# Build and deploy (Cloud Build will build the Docker image)
gcloud run deploy graph-api \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --service-account graph-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --set-secrets="/app/token.pickle=graph-token:latest" \
    --set-secrets="/app/config.yaml=graph-config:latest" \
    --min-instances 0 \
    --max-instances 1 \
    --memory 512Mi \
    --timeout 60
```

### 5. Update Your HTML Files

After deployment, you'll get a URL like: `https://graph-api-xxxxx-uc.a.run.app`

Update the `API_BASE` in your HTML files or configure it to detect the Cloud Run URL.

## Cost Estimate

For personal use with occasional edits:
- **Cloud Run**: Free tier covers 2M requests/month
- **Secret Manager**: Free for 6 active secrets
- **Container Registry**: Minimal storage cost (~$0.01/month)

**Expected monthly cost: $0.00 - $0.10**

## Local Testing with Docker

```bash
# Build the image locally
docker build -t graph-api .

# Run locally (mount your credentials)
docker run -p 8080:8080 \
    -v $(pwd)/token.pickle:/app/token.pickle \
    -v $(pwd)/config.yaml:/app/config.yaml \
    graph-api
```

## Updating the Deployment

After making code changes:

```bash
gcloud run deploy graph-api --source . --region us-central1
```

## Troubleshooting

### Cold Start Delays
First request after idle may take 2-5 seconds. This is normal for scale-to-zero.

### Token Refresh Issues
If your OAuth token expires, you'll need to:
1. Run the app locally to refresh the token
2. Re-upload the new token.pickle to Secret Manager:
   ```bash
   python -c "import base64; print(base64.b64encode(open('token.pickle', 'rb').read()).decode())" | \
       gcloud secrets versions add graph-token --data-file=-
   ```

### Viewing Logs
```bash
gcloud run logs read graph-api --region us-central1
```
