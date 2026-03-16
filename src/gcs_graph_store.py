"""Google Cloud Storage backing store for default and user-created graphs."""
import os
from pathlib import Path
from typing import Optional

from google.cloud import storage
import yaml

from file_utils import FileUtils


PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_ROOT / 'config.yaml'
STRUCTURES_DIR = PROJECT_ROOT / 'structures'
GRAPH_PREFIX = 'graphs/'
DEFAULT_STRUCTURE_PATH = PROJECT_ROOT / 'structure.txt'
DEFAULT_BLOB_NAME = 'default/structure.txt'


def get_graph_bucket_name() -> Optional[str]:
    """Get the graph bucket name from env or config."""
    bucket_name = os.getenv('GRAPH_BUCKET_NAME', '').strip()
    if bucket_name:
        return bucket_name

    if not CONFIG_PATH.exists():
        return None

    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file) or {}
        return config.get('google_cloud_storage', {}).get('bucket_name')
    except Exception:
        return None


def _get_client() -> storage.Client:
    return storage.Client()


def _get_blob_name(graph_name: str) -> str:
    return f"{GRAPH_PREFIX}{graph_name}.txt"


class GCSBackedFileUtils(FileUtils):
    """File utils that upload the default structure to GCS after saves."""

    def save_structure(self, data):
        super().save_structure(data)
        upload_default_structure_to_gcs(self.structure_file_path)


def download_default_structure_from_gcs() -> bool:
    """Download the default structure.txt from GCS."""
    bucket_name = get_graph_bucket_name()
    if not bucket_name:
        print('⚠️  GRAPH_BUCKET_NAME not configured, skipping default structure download from GCS')
        return False

    try:
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(DEFAULT_BLOB_NAME)
        if not blob.exists():
            print('⚠️  Default structure object not found in GCS, keeping local structure.txt')
            return False

        blob.download_to_filename(DEFAULT_STRUCTURE_PATH)
        print(f'✅ Downloaded default structure from GCS bucket {bucket_name}')
        return True
    except Exception as error:
        print(f'⚠️  Failed to download default structure from GCS: {error}')
        return False


def upload_default_structure_to_gcs(file_path: Optional[str] = None) -> bool:
    """Upload the default structure.txt to GCS."""
    bucket_name = get_graph_bucket_name()
    if not bucket_name:
        print('⚠️  GRAPH_BUCKET_NAME not configured, skipping default structure upload to GCS')
        return False

    local_path = Path(file_path) if file_path else DEFAULT_STRUCTURE_PATH
    if not local_path.exists():
        print(f'⚠️  Default structure file not found for GCS upload: {local_path}')
        return False

    try:
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(DEFAULT_BLOB_NAME)
        blob.upload_from_filename(local_path, content_type='text/plain')
        print('✅ Uploaded default structure to GCS')
        return True
    except Exception as error:
        print(f'⚠️  Failed to upload default structure to GCS: {error}')
        return False


def download_all_graphs_from_gcs() -> bool:
    """Download all graph files from the configured GCS bucket into structures/."""
    bucket_name = get_graph_bucket_name()
    if not bucket_name:
        print('⚠️  GRAPH_BUCKET_NAME not configured, skipping graph download from GCS')
        return False

    try:
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blobs = list(client.list_blobs(bucket, prefix=GRAPH_PREFIX))

        STRUCTURES_DIR.mkdir(parents=True, exist_ok=True)

        count = 0
        for blob in blobs:
            if blob.name.endswith('/'):
                continue
            file_name = Path(blob.name).name
            local_path = STRUCTURES_DIR / file_name
            blob.download_to_filename(local_path)
            count += 1
            print(f'  ✓ Downloaded graph from GCS: {file_name}')

        print(f'✅ Downloaded {count} graph(s) from GCS bucket {bucket_name}')
        return True
    except Exception as error:
        print(f'⚠️  Failed to download graphs from GCS: {error}')
        return False


def upload_graph_to_gcs(graph_name: str, file_path: Optional[str] = None) -> bool:
    """Upload a graph file to GCS."""
    bucket_name = get_graph_bucket_name()
    if not bucket_name:
        print('⚠️  GRAPH_BUCKET_NAME not configured, skipping graph upload to GCS')
        return False

    local_path = Path(file_path) if file_path else STRUCTURES_DIR / f'{graph_name}.txt'
    if not local_path.exists():
        print(f'⚠️  Graph file not found for GCS upload: {local_path}')
        return False

    try:
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_get_blob_name(graph_name))
        blob.upload_from_filename(local_path, content_type='text/plain')
        print(f'✅ Uploaded graph to GCS: {graph_name}')
        return True
    except Exception as error:
        print(f'⚠️  Failed to upload graph to GCS ({graph_name}): {error}')
        return False


def delete_graph_from_gcs(graph_name: str) -> bool:
    """Delete a graph file from GCS."""
    bucket_name = get_graph_bucket_name()
    if not bucket_name:
        print('⚠️  GRAPH_BUCKET_NAME not configured, skipping graph deletion from GCS')
        return False

    try:
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_get_blob_name(graph_name))
        if blob.exists():
            blob.delete()
            print(f'✅ Deleted graph from GCS: {graph_name}')
        return True
    except Exception as error:
        print(f'⚠️  Failed to delete graph from GCS ({graph_name}): {error}')
        return False
