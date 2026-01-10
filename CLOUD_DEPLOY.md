# Google Cloud Run Deployment Guide

This guide will help you deploy your Graph App to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed ([Download](https://cloud.google.com/sdk/docs/install))
3. **Docker** installed locally (optional, for local testing)
4. **Google Drive credentials** (credentials.json)

## Step 1: Set Up Google Cloud Project

```bash
# Create a new project (or use existing)
gcloud projects create your-project-id --name="Graph App"

# Set the project
gcloud config set project your-project-id

# Enable billing (must be done in console)
# Go to: https://console.cloud.google.com/billing
```

## Step 2: Create Secrets

Your app needs two secrets in Google Secret Manager:

### A. Create `credentials.json` secret
```bash
# Upload your Google Drive credentials
gcloud secrets create graph-credentials \
    --data-file=credentials.json \
    --replication-policy="automatic"
```

### B. Create `config.yaml` secret
```bash
# Upload your config file
gcloud secrets create graph-config \
    --data-file=config.yaml \
    --replication-policy="automatic"
```

### Grant Secret Access
```bash
# Get the Cloud Run service account email
PROJECT_NUMBER=$(gcloud projects describe your-project-id --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant access to secrets
gcloud secrets add-iam-policy-binding graph-credentials \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding graph-config \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
```

## Step 3: Deploy to Cloud Run

### Option A: Using the deployment script (Recommended)

**Windows:**
```powershell
# Edit deploy-cloud-run.ps1 and update PROJECT_ID
.\deploy-cloud-run.ps1
```

**Linux/Mac:**
```bash
# Edit deploy-cloud-run.sh and update PROJECT_ID
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh
```

### Option B: Manual deployment

1. Edit deployment script and update `PROJECT_ID`
2. Build the image:
   ```bash
   gcloud builds submit --tag gcr.io/your-project-id/graph-app -f Dockerfile.prod .
   ```

3. Deploy to Cloud Run:
   ```bash
   gcloud run deploy graph-app \
       --image gcr.io/your-project-id/graph-app \
       --platform managed \
       --region us-central1 \
       --allow-unauthenticated \
       --port 8080 \
       --memory 512Mi \
       --set-env-vars "PRODUCTION=true" \
       --set-secrets "config.yaml=graph-config:latest,credentials.json=graph-credentials:latest"
   ```

## Step 4: Access Your App

After deployment completes, you'll get a URL like:
```
https://graph-app-xxxxx-uc.a.run.app
```

Visit this URL in your browser to access your app!

## Architecture

```
┌─────────────────────────────────────┐
│     Google Cloud Run Container      │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │   FastAPI    │  │   React     │ │
│  │   Backend    │  │   Frontend  │ │
│  │  (Port 8080) │  │  (Built)    │ │
│  └──────────────┘  └─────────────┘ │
│         │                │          │
│         └────────────────┘          │
│                │                    │
└────────────────┼────────────────────┘
                 │
                 ▼
         ┌──────────────┐
         │ Google Drive │
         │  structure   │
         └──────────────┘
```

## Configuration

### Environment Variables
- `PRODUCTION=true` - Enables production mode (serves React frontend)
- `PORT=8080` - Cloud Run automatically sets this

### Secrets (mounted as files)
- `/app/config.yaml` - Your config
- `/app/credentials.json` - Google Drive credentials

## Monitoring & Logs

View logs in real-time:
```bash
gcloud run services logs tail graph-app --region us-central1
```

Or in the console:
https://console.cloud.google.com/run

## Updating the App

To deploy updates:
```bash
# Just run the deployment script again
./deploy-cloud-run.sh
```

Cloud Run will:
1. Build a new container image
2. Deploy with zero downtime
3. Automatically route traffic to the new version

## Cost Estimation

Cloud Run pricing (as of 2024):
- **Free tier**: 2 million requests/month
- **Compute**: ~$0.00002400/vCPU-second
- **Memory**: ~$0.00000250/GiB-second
- **Requests**: $0.40 per million requests

For light personal use, you'll likely stay within the free tier.

## Troubleshooting

### Build fails
- Check that all dependencies are in `requirements.txt` and `package.json`
- Verify Node.js version compatibility

### Deployment fails
- Verify secrets exist: `gcloud secrets list`
- Check IAM permissions
- Review logs: `gcloud run services logs tail graph-app`

### App doesn't load
- Check health endpoint: `https://your-url/health`
- View logs in Cloud Console
- Verify secrets are mounted correctly

### Connection to Google Drive fails
- Verify credentials.json is valid
- Check if token.pickle needs regeneration
- Review API quotas in Google Cloud Console

## Local Testing

Test the production build locally:

```bash
# Build the image
docker build -f Dockerfile.prod -t graph-app .

# Run locally
docker run -p 8080:8080 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/credentials.json:/app/credentials.json \
  -e PRODUCTION=true \
  graph-app
```

Visit http://localhost:8080

## Security Notes

- Secrets are stored in Google Secret Manager (encrypted at rest)
- Cloud Run uses HTTPS by default
- Consider adding authentication if needed:
  ```bash
  gcloud run deploy graph-app --no-allow-unauthenticated
  ```

## Support

For issues:
1. Check logs: `gcloud run services logs tail graph-app`
2. Review Cloud Run docs: https://cloud.google.com/run/docs
3. Check billing/quotas in console
