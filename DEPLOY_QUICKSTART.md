# Quick Start - Google Cloud Deployment

## What You'll Get
Your Graph App running on Google Cloud Run with:
- ✅ Automatic HTTPS
- ✅ Automatic scaling (0 to millions of users)
- ✅ Pay only for what you use (likely FREE with free tier)
- ✅ Global CDN
- ✅ Zero server management

## Deployment in 5 Steps

### 1. Install gcloud CLI
**Windows:** Download from https://cloud.google.com/sdk/docs/install
```powershell
# After install, initialize
gcloud init
```

### 2. Set Up Your Project
```powershell
# Edit deploy-cloud-run.ps1
# Change line 4: $PROJECT_ID = "your-project-id"
# Choose a unique name like: graph-app-yourname
```

### 3. Create Secrets
```powershell
# Create credentials secret
gcloud secrets create graph-credentials --data-file=credentials.json --replication-policy="automatic"

# Create config secret
gcloud secrets create graph-config --data-file=config.yaml --replication-policy="automatic"

# Grant access
$PROJECT_NUMBER = gcloud projects describe YOUR-PROJECT-ID --format="value(projectNumber)"
gcloud secrets add-iam-policy-binding graph-credentials --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding graph-config --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

### 4. Deploy
```powershell
.\deploy-cloud-run.ps1
```

### 5. Access Your App
The script will output your URL:
```
✅ Deployment completed successfully!
🌐 Your app is now running at:
https://graph-app-xxxxx-uc.a.run.app
```

## Cost
- **Free tier:** 2 million requests/month
- **After that:** ~$0.40 per million requests
- **Personal use:** Likely stays FREE forever

## Files Created
- `Dockerfile.prod` - Production container configuration
- `deploy-cloud-run.ps1` - Windows deployment script
- `deploy-cloud-run.sh` - Linux/Mac deployment script
- `CLOUD_DEPLOY.md` - Complete documentation
- `test-docker.ps1` - Local testing script
- `.dockerignore` - Updated for frontend build

## What Changed in Your Code
- ✅ API now serves React frontend in production
- ✅ Health check endpoint added
- ✅ Multi-stage Docker build (frontend + backend)
- ✅ Production/development mode detection

## Need Help?
1. Read `CLOUD_DEPLOY.md` for detailed guide
2. Test locally first: `.\test-docker.ps1`
3. Check logs: `gcloud run services logs tail graph-app`

## Next Steps After Deployment
1. Visit your Cloud Run URL
2. The app will automatically:
   - Download structure from Google Drive
   - Generate HTML files
   - Serve the React frontend
3. Use the app normally - changes sync to Google Drive

## Updating
Just run the deploy script again:
```powershell
.\deploy-cloud-run.ps1
```
Zero downtime updates!
