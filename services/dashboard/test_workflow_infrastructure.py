#!/usr/bin/env python3
"""
Integration test for Workflow Engine Infrastructure

Tests:
1. Configuration loading
2. Celery app initialization
3. Worker task imports
4. WebSocket service initialization
5. Workflow service initialization
"""

import sys
import os

print("=" * 70)
print("Jarvis Workflow Engine Infrastructure - Integration Test")
print("=" * 70)

# Test 1: Configuration
print("\n1. Testing configuration...")
try:
    from config import Config
    assert hasattr(Config, 'REDIS_URL'), "REDIS_URL not in config"
    assert hasattr(Config, 'CELERY_BROKER_URL'), "CELERY_BROKER_URL not in config"
    assert hasattr(Config, 'CELERY_RESULT_BACKEND'), "CELERY_RESULT_BACKEND not in config"
    assert hasattr(Config, 'WEBSOCKET_PING_INTERVAL'), "WEBSOCKET_PING_INTERVAL not in config"
    print("   ✓ Configuration loaded successfully")
    print(f"   Redis URL: {Config.REDIS_URL}")
    print(f"   Celery Broker: {Config.CELERY_BROKER_URL}")
except Exception as e:
    print(f"   ✗ Configuration test failed: {e}")
    sys.exit(1)

# Test 2: Celery app initialization
print("\n2. Testing Celery app initialization...")
try:
    from celery_app import celery_app
    assert celery_app is not None, "Celery app not initialized"
    print("   ✓ Celery app initialized")
    print(f"   Broker: {celery_app.conf.broker_url}")
    print(f"   Backend: {celery_app.conf.result_backend}")
    print(f"   Task routes: {len(celery_app.conf.task_routes)} configured")
except Exception as e:
    print(f"   ✗ Celery app test failed: {e}")
    sys.exit(1)

# Test 3: Worker task imports
print("\n3. Testing worker task imports...")
try:
    from workers.workflow_worker import (
        run_deployment_workflow,
        run_dns_update_workflow,
        run_artifact_analysis_workflow
    )
    print("   ✓ Worker tasks imported successfully")
    print(f"   - {run_deployment_workflow.name}")
    print(f"   - {run_dns_update_workflow.name}")
    print(f"   - {run_artifact_analysis_workflow.name}")
except Exception as e:
    print(f"   ✗ Worker tasks test failed: {e}")
    sys.exit(1)

# Test 4: WebSocket service
print("\n4. Testing WebSocket service...")
try:
    from services.websocket_service import websocket_service, WebSocketService
    assert websocket_service is not None, "WebSocket service not initialized"
    assert isinstance(websocket_service, WebSocketService), "Invalid WebSocket service type"
    print("   ✓ WebSocket service initialized")
    conn_count = websocket_service.get_connection_count()
    print(f"   Connection rooms: {list(conn_count.keys())}")
except Exception as e:
    print(f"   ✗ WebSocket service test failed: {e}")
    sys.exit(1)

# Test 5: Workflow service
print("\n5. Testing Workflow service...")
try:
    from services.workflow_service import workflow_service, WorkflowService
    assert workflow_service is not None, "Workflow service not initialized"
    assert isinstance(workflow_service, WorkflowService), "Invalid Workflow service type"
    print("   ✓ Workflow service initialized")
except Exception as e:
    print(f"   ✗ Workflow service test failed: {e}")
    sys.exit(1)

# Test 6: WebSocket routes
print("\n6. Testing WebSocket routes...")
try:
    from routes.websocket_routes import ws_bp
    assert ws_bp is not None, "WebSocket blueprint not initialized"
    print("   ✓ WebSocket routes blueprint loaded")
    print(f"   Blueprint name: {ws_bp.name}")
    print(f"   URL prefix: {ws_bp.url_prefix}")
except Exception as e:
    print(f"   ✗ WebSocket routes test failed: {e}")
    sys.exit(1)

# Test 7: Model imports
print("\n7. Testing model imports...")
try:
    from models.workflow import Workflow, WorkflowStatus
    assert Workflow is not None, "Workflow model not found"
    assert WorkflowStatus is not None, "WorkflowStatus enum not found"
    print("   ✓ Workflow models loaded")
    print(f"   Available statuses: {[s.value for s in WorkflowStatus]}")
except Exception as e:
    print(f"   ✗ Model imports test failed: {e}")
    sys.exit(1)

# Test 8: Check example file
print("\n8. Checking example workflow file...")
try:
    example_path = os.path.join(os.path.dirname(__file__), 'examples', 'workflow_example.py')
    assert os.path.exists(example_path), "Example file not found"
    with open(example_path, 'r') as f:
        content = f.read()
        assert 'example_deployment_workflow' in content, "Main example function not found"
    print("   ✓ Example workflow file exists and is valid")
except Exception as e:
    print(f"   ✗ Example file test failed: {e}")
    sys.exit(1)

print("\n" + "=" * 70)
print("✓ All integration tests passed!")
print("=" * 70)
print("\nNext steps:")
print("1. Start Redis: docker-compose up -d redis")
print("2. Start Celery worker: ./start_celery.sh")
print("3. Start Dashboard: python app.py")
print("4. Run example: python examples/workflow_example.py")
print("=" * 70)
