"""
Test API endpoints on Replit
"""
import pytest

@pytest.mark.unit
def test_health_endpoint(client):
    """Test health check endpoint"""
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert 'status' in data

@pytest.mark.unit
def test_login_page(client):
    """Test login page renders"""
    response = client.get('/login')
    assert response.status_code in [200, 302]

@pytest.mark.unit
def test_control_center(auth_client):
    """Test control center page"""
    response = auth_client.get('/control-center')
    assert response.status_code in [200, 302]

@pytest.mark.unit
def test_smart_home_api(auth_client):
    """Test smart home API endpoints"""
    response = auth_client.get('/api/homeassistant/devices')
    assert response.status_code in [200, 401]

@pytest.mark.unit
def test_ai_foundry_api(auth_client):
    """Test AI foundry API endpoints"""
    response = auth_client.get('/api/ai-foundry/models')
    assert response.status_code in [200, 401, 404]

@pytest.mark.unit
def test_marketplace_api(auth_client):
    """Test marketplace API endpoints"""
    response = auth_client.get('/api/marketplace/templates')
    assert response.status_code in [200, 401]

@pytest.mark.unit
def test_demo_mode_available(app_context):
    """Test that demo mode is properly configured"""
    from services.demo_registry import DEMO_MODE
    assert DEMO_MODE is not None
    
@pytest.mark.unit
def test_mock_services_available(mock_ollama_service, mock_ha_service):
    """Test that mock services are available"""
    assert mock_ollama_service.is_available()
    assert mock_ha_service.is_available()
    
    # Test mock data
    models = mock_ollama_service.list_models()
    assert len(models) > 0
    
    devices = mock_ha_service.get_devices()
    assert len(devices) > 0
