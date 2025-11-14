#!/usr/bin/env python3
"""
Jarvis Upload Service Usage Examples

This script demonstrates how to use the upload service programmatically
to upload files, create artifact records, and trigger deployment workflows.
"""

import os
import sys
import requests
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.upload_service import upload_service
from services.file_validator import file_validator
from services.db_service import db_service
from models.artifact import Artifact, FileType


def example_1_validate_file():
    """Example 1: Validate a file before uploading"""
    print("=" * 60)
    print("Example 1: File Validation")
    print("=" * 60)
    
    test_file = "/tmp/test_upload.zip"
    
    # Create a test file
    with open(test_file, 'wb') as f:
        f.write(b'PK\x03\x04' + b'\x00' * 100)  # Minimal zip header
    
    file_size = os.path.getsize(test_file)
    
    # Validate the file
    is_valid, error = file_validator.validate_file(
        test_file,
        "test_upload.zip",
        file_size
    )
    
    if is_valid:
        print("✓ File validation passed")
    else:
        print(f"✗ File validation failed: {error}")
    
    # Clean up
    os.remove(test_file)
    print()


def example_2_upload_single_file():
    """Example 2: Upload a single file to MinIO"""
    print("=" * 60)
    print("Example 2: Upload Single File")
    print("=" * 60)
    
    # Create a test file
    test_file = "/tmp/deployment.tar.gz"
    test_content = b"This is a test deployment package"
    
    with open(test_file, 'wb') as f:
        f.write(test_content)
    
    try:
        # Upload the file
        upload_info = upload_service.upload_file(
            file_path=test_file,
            original_filename="deployment.tar.gz",
            bucket="deployments"
        )
        
        print("✓ File uploaded successfully:")
        print(f"  Bucket: {upload_info['bucket']}")
        print(f"  Object Name: {upload_info['object_name']}")
        print(f"  File Size: {upload_info['file_size']} bytes")
        print(f"  Checksum: {upload_info['checksum_sha256']}")
        print(f"  Storage Path: {upload_info['storage_path']}")
        
        return upload_info
    
    except Exception as e:
        print(f"✗ Upload failed: {e}")
        return None
    
    finally:
        # Clean up
        if os.path.exists(test_file):
            os.remove(test_file)
        print()


def example_3_create_artifact_record(upload_info):
    """Example 3: Create artifact record in database"""
    print("=" * 60)
    print("Example 3: Create Artifact Record")
    print("=" * 60)
    
    if not upload_info:
        print("✗ No upload info provided, skipping")
        print()
        return None
    
    if not db_service.is_available:
        print("✗ Database not available, skipping")
        print()
        return None
    
    try:
        artifact = Artifact(
            filename=upload_info['safe_filename'],
            original_filename=upload_info['original_filename'],
            file_type=FileType.single_file,
            storage_path=upload_info['storage_path'],
            file_size=upload_info['file_size'],
            checksum_sha256=upload_info['checksum_sha256'],
            uploaded_by='example_script',
            detected_service_type='web_app',
            artifact_metadata={
                'bucket': upload_info['bucket'],
                'upload_method': 'programmatic',
                'example': True
            }
        )
        
        db_session = db_service.get_session()
        db_session.add(artifact)
        db_session.commit()
        
        artifact_id = str(artifact.id)
        db_session.close()
        
        print("✓ Artifact record created successfully:")
        print(f"  ID: {artifact_id}")
        print(f"  Filename: {artifact.filename}")
        print(f"  Type: {artifact.file_type.value}")
        
        return artifact_id
    
    except Exception as e:
        print(f"✗ Failed to create artifact record: {e}")
        return None
    
    finally:
        print()


def example_4_list_artifacts():
    """Example 4: List all artifacts"""
    print("=" * 60)
    print("Example 4: List Artifacts")
    print("=" * 60)
    
    try:
        artifacts = upload_service.list_artifacts(bucket='artifacts')
        
        print(f"✓ Found {len(artifacts)} artifacts:")
        for i, artifact in enumerate(artifacts[:5], 1):
            print(f"  {i}. {artifact['object_name']}")
            print(f"     Size: {artifact['size']} bytes")
            print(f"     Modified: {artifact['last_modified']}")
        
        if len(artifacts) > 5:
            print(f"  ... and {len(artifacts) - 5} more")
    
    except Exception as e:
        print(f"✗ Failed to list artifacts: {e}")
    
    finally:
        print()


def example_5_upload_via_api():
    """Example 5: Upload file via REST API"""
    print("=" * 60)
    print("Example 5: Upload via REST API")
    print("=" * 60)
    
    # Create a test file
    test_file = "/tmp/api_upload.html"
    with open(test_file, 'w') as f:
        f.write("<html><body><h1>Test Upload</h1></body></html>")
    
    try:
        # Note: You would need to be authenticated for this to work
        # This is just an example of the API structure
        
        api_url = "http://localhost:5000/api/upload/file"
        
        with open(test_file, 'rb') as f:
            files = {'file': ('api_upload.html', f, 'text/html')}
            data = {'bucket': 'artifacts', 'description': 'API upload test'}
            
            # This would require session cookies from login
            # response = requests.post(api_url, files=files, data=data)
            
            print("API Upload Example:")
            print(f"  Endpoint: POST {api_url}")
            print(f"  File: api_upload.html")
            print(f"  Bucket: artifacts")
            print()
            print("Note: Authentication required. Use authenticated session.")
    
    except Exception as e:
        print(f"✗ API upload example error: {e}")
    
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)
        print()


def example_6_download_artifact(artifact_id):
    """Example 6: Download an artifact"""
    print("=" * 60)
    print("Example 6: Download Artifact")
    print("=" * 60)
    
    if not artifact_id:
        print("✗ No artifact ID provided, skipping")
        print()
        return
    
    try:
        # Get artifact details from database
        if not db_service.is_available:
            print("✗ Database not available")
            print()
            return
        
        db_session = db_service.get_session()
        artifact = db_session.query(Artifact).filter_by(id=artifact_id).first()
        
        if not artifact:
            print(f"✗ Artifact {artifact_id} not found")
            db_session.close()
            print()
            return
        
        # Parse storage path
        parts = artifact.storage_path.split('/', 1)
        bucket, object_name = parts
        
        # Get download URL
        download_url = upload_service.get_artifact_url(bucket, object_name)
        
        print("✓ Download URL generated:")
        print(f"  URL: {download_url}")
        print(f"  Valid for: 1 hour")
        print(f"  Filename: {artifact.original_filename}")
        
        db_session.close()
    
    except Exception as e:
        print(f"✗ Failed to generate download URL: {e}")
    
    finally:
        print()


def main():
    """Run all examples"""
    print("\n" + "=" * 60)
    print("Jarvis Upload Service Examples")
    print("=" * 60 + "\n")
    
    # Run examples
    example_1_validate_file()
    
    upload_info = example_2_upload_single_file()
    artifact_id = example_3_create_artifact_record(upload_info)
    
    example_4_list_artifacts()
    example_5_upload_via_api()
    example_6_download_artifact(artifact_id)
    
    print("=" * 60)
    print("Examples completed!")
    print("=" * 60)


if __name__ == '__main__':
    main()
