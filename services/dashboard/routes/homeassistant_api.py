from flask import Blueprint, jsonify, request
from services.demo_registry import get_homeassistant_service
from utils.auth import require_auth

ha_bp = Blueprint('homeassistant', __name__)

@ha_bp.route('/api/homeassistant/devices', methods=['GET'])
@require_auth
def get_devices():
    """Get all Home Assistant devices"""
    ha_service = get_homeassistant_service()
    devices = ha_service.get_devices()
    return jsonify({'devices': devices})

@ha_bp.route('/api/homeassistant/automations', methods=['GET'])
@require_auth
def get_automations():
    """Get all automations"""
    ha_service = get_homeassistant_service()
    automations = ha_service.get_automations()
    return jsonify({'automations': automations})

@ha_bp.route('/api/homeassistant/energy', methods=['GET'])
@require_auth
def get_energy_stats():
    """Get energy monitoring stats"""
    ha_service = get_homeassistant_service()
    stats = ha_service.get_energy_stats()
    return jsonify(stats)

@ha_bp.route('/api/homeassistant/control', methods=['POST'])
@require_auth
def control_device():
    """Control a device (turn on/off, set value)"""
    data = request.get_json()
    device_id = data.get('device_id')
    action = data.get('action')
    
    ha_service = get_homeassistant_service()
    result = ha_service.control_device(device_id, action)
    
    return jsonify(result)
