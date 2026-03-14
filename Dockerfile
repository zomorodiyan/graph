# Multi-stage Dockerfile for production deployment
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Python backend with built frontend
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY src/ ./src/
COPY run.py ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist ./frontend-dist

# Copy structures (graphs)
COPY structures/ ./structures/

# Create directories for runtime data
RUN mkdir -p html data

# Create placeholder config files (will be overridden by mounted secrets)
RUN touch config.yaml credentials.json structure.txt

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PRODUCTION=true

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Run the API server
CMD ["python", "-m", "uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8080"]
