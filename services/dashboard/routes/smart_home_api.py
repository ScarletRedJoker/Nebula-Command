"""Smart Home Control API Routes"""
from flask import Blueprint, jsonify, request, render_template
import logging
from typing import Dict, List, Any
from datetime import datetime

from services.home_assistant_service import home_assistant_service
from utils.auth import require_auth

logger = logging.getLogger(__name__)

smart_home_bp = Blueprint('smart_home', __name__, url_prefix='/smarthome')


@smart_home_bp.route('/')
@require_auth
def smart_home_dashboard():
    """Render smart home control dashboard"""
    return render_template('smart_home.html')


@smart_home_bp.route('/api/devices', methods=['GET'])
@require_auth
def get_all_devices():
    """Get all smart home devices"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({
                'success': False,
                'error': 'Home Assistant not configured. Please set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN environment variables.'
            }), 503
        
        domain_filter = request.args.get('domain')
        devices = home_assistant_service.get_devices(domain=domain_filter)
        
        return jsonify({
            'success': True,
            'devices': devices,
            'count': len(devices)
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting devices: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/devices/<domain>', methods=['GET'])
@require_auth
def get_devices_by_domain(domain: str):
    """Get devices filtered by domain"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        valid_domains = ['light', 'switch', 'sensor', 'climate', 'automation', 'scene']
        if domain not in valid_domains:
            return jsonify({
                'success': False,
                'error': f'Invalid domain. Must be one of: {", ".join(valid_domains)}'
            }), 400
        
        devices = home_assistant_service.get_devices(domain=domain)
        
        return jsonify({
            'success': True,
            'domain': domain,
            'devices': devices,
            'count': len(devices)
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting {domain} devices: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>', methods=['GET'])
@require_auth
def get_device_state(entity_id: str):
    """Get state of a specific device"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        state = home_assistant_service.get_state(entity_id)
        
        if not state:
            return jsonify({
                'success': False,
                'error': f'Device {entity_id} not found'
            }), 404
        
        return jsonify({
            'success': True,
            'entity_id': entity_id,
            'state': state
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting device state: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>/turn_on', methods=['POST'])
@require_auth
def turn_on_device(entity_id: str):
    """Turn on a device"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json() or {}
        success = home_assistant_service.turn_on(entity_id, **data)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'{entity_id} turned on',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to turn on device'
            }), 500
    
    except Exception as e:
        logger.error(f"Error turning on device: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>/turn_off', methods=['POST'])
@require_auth
def turn_off_device(entity_id: str):
    """Turn off a device"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.turn_off(entity_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'{entity_id} turned off',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to turn off device'
            }), 500
    
    except Exception as e:
        logger.error(f"Error turning off device: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/light/<path:entity_id>/brightness', methods=['POST'])
@require_auth
def set_light_brightness(entity_id: str):
    """Set brightness of a light"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'brightness' not in data:
            return jsonify({'success': False, 'error': 'brightness parameter required'}), 400
        
        brightness = int(data['brightness'])
        if not 0 <= brightness <= 255:
            return jsonify({'success': False, 'error': 'brightness must be between 0 and 255'}), 400
        
        success = home_assistant_service.set_brightness(entity_id, brightness)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Brightness set to {brightness}',
                'entity_id': entity_id,
                'brightness': brightness
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set brightness'}), 500
    
    except Exception as e:
        logger.error(f"Error setting brightness: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/light/<path:entity_id>/color', methods=['POST'])
@require_auth
def set_light_color(entity_id: str):
    """Set color of a light"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'rgb_color' not in data:
            return jsonify({'success': False, 'error': 'rgb_color parameter required (array of [r,g,b])'}), 400
        
        rgb_color = data['rgb_color']
        if not isinstance(rgb_color, list) or len(rgb_color) != 3:
            return jsonify({'success': False, 'error': 'rgb_color must be array of 3 values'}), 400
        
        success = home_assistant_service.set_color(entity_id, tuple(rgb_color))
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Color set to RGB{tuple(rgb_color)}',
                'entity_id': entity_id,
                'rgb_color': rgb_color
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set color'}), 500
    
    except Exception as e:
        logger.error(f"Error setting color: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/climate/<path:entity_id>/temperature', methods=['POST'])
@require_auth
def set_climate_temperature(entity_id: str):
    """Set temperature for climate device"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'temperature' not in data:
            return jsonify({'success': False, 'error': 'temperature parameter required'}), 400
        
        temperature = float(data['temperature'])
        success = home_assistant_service.set_temperature(entity_id, temperature)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Temperature set to {temperature}',
                'entity_id': entity_id,
                'temperature': temperature
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set temperature'}), 500
    
    except Exception as e:
        logger.error(f"Error setting temperature: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/scene/<path:entity_id>/activate', methods=['POST'])
@require_auth
def activate_scene(entity_id: str):
    """Activate a scene"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.activate_scene(entity_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Scene {entity_id} activated',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to activate scene'}), 500
    
    except Exception as e:
        logger.error(f"Error activating scene: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/automation/<path:entity_id>/trigger', methods=['POST'])
@require_auth
def trigger_automation(entity_id: str):
    """Trigger an automation"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.trigger_automation(entity_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Automation {entity_id} triggered',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to trigger automation'}), 500
    
    except Exception as e:
        logger.error(f"Error triggering automation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/automation/templates', methods=['GET'])
@require_auth
def get_automation_templates():
    """Get pre-made automation templates"""
    templates = [
        {
            'id': 'good_morning',
            'name': 'Good Morning',
            'description': 'Turn on lights, adjust temperature, start coffee maker',
            'icon': 'sun',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'bedroom_lights', 'brightness': 180},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72},
                {'type': 'switch', 'action': 'turn_on', 'entities': 'coffee_maker'}
            ]
        },
        {
            'id': 'good_night',
            'name': 'Good Night',
            'description': 'Turn off all lights, lock doors, set security',
            'icon': 'moon',
            'actions': [
                {'type': 'light', 'action': 'turn_off', 'entities': 'all_lights'},
                {'type': 'lock', 'action': 'lock', 'entities': 'all_locks'},
                {'type': 'alarm', 'action': 'arm', 'mode': 'night'}
            ]
        },
        {
            'id': 'leaving_home',
            'name': 'Leaving Home',
            'description': 'Turn off everything, lock up, arm security',
            'icon': 'door-open',
            'actions': [
                {'type': 'light', 'action': 'turn_off', 'entities': 'all_lights'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 65},
                {'type': 'lock', 'action': 'lock', 'entities': 'all_locks'},
                {'type': 'alarm', 'action': 'arm', 'mode': 'away'}
            ]
        },
        {
            'id': 'arriving_home',
            'name': 'Arriving Home',
            'description': 'Turn on lights, disarm security, adjust climate',
            'icon': 'house',
            'actions': [
                {'type': 'alarm', 'action': 'disarm'},
                {'type': 'light', 'action': 'turn_on', 'entities': 'entry_lights'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72}
            ]
        },
        {
            'id': 'movie_time',
            'name': 'Movie Time',
            'description': 'Dim lights, close blinds, turn on TV',
            'icon': 'film',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'living_room_lights', 'brightness': 50},
                {'type': 'cover', 'action': 'close', 'entities': 'living_room_blinds'},
                {'type': 'media_player', 'action': 'turn_on', 'entities': 'tv'}
            ]
        },
        {
            'id': 'party_mode',
            'name': 'Party Mode',
            'description': 'Colorful lights, music on, adjust temperature',
            'icon': 'party-horn',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'all_lights', 'effect': 'colorloop'},
                {'type': 'media_player', 'action': 'turn_on', 'entities': 'speakers'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 70}
            ]
        },
        {
            'id': 'work_mode',
            'name': 'Work Mode',
            'description': 'Bright lights, focus temperature, quiet mode',
            'icon': 'laptop',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'office_lights', 'brightness': 255},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 68},
                {'type': 'media_player', 'action': 'turn_off', 'entities': 'all_speakers'}
            ]
        },
        {
            'id': 'dinner_time',
            'name': 'Dinner Time',
            'description': 'Warm lighting, comfortable temperature',
            'icon': 'utensils',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'dining_room_lights', 'brightness': 150, 'color_temp': 2700},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72}
            ]
        }
    ]
    
    return jsonify({
        'success': True,
        'templates': templates,
        'count': len(templates)
    }), 200


@smart_home_bp.route('/api/voice/command', methods=['POST'])
@require_auth
def process_voice_command():
    """Process natural language voice command from Google Home"""
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'success': False, 'error': 'command parameter required'}), 400
        
        command = data['command'].lower().strip()
        response_text = "I'm sorry, I didn't understand that command."
        success = False
        
        if 'turn on' in command or 'turn off' in command:
            action = 'turn_on' if 'turn on' in command else 'turn_off'
            
            if 'all lights' in command or 'every light' in command:
                lights = home_assistant_service.get_lights()
                for light in lights:
                    if action == 'turn_on':
                        home_assistant_service.turn_on(light['entity_id'])
                    else:
                        home_assistant_service.turn_off(light['entity_id'])
                response_text = f"All lights {'turned on' if action == 'turn_on' else 'turned off'}"
                success = True
            
            elif 'living room' in command:
                entity_id = 'light.living_room'
                if action == 'turn_on':
                    home_assistant_service.turn_on(entity_id)
                else:
                    home_assistant_service.turn_off(entity_id)
                response_text = f"Living room lights {'turned on' if action == 'turn_on' else 'turned off'}"
                success = True
            
            elif 'bedroom' in command:
                entity_id = 'light.bedroom'
                if action == 'turn_on':
                    home_assistant_service.turn_on(entity_id)
                else:
                    home_assistant_service.turn_off(entity_id)
                response_text = f"Bedroom lights {'turned on' if action == 'turn_on' else 'turned off'}"
                success = True
        
        elif 'set temperature to' in command or 'set thermostat to' in command:
            import re
            temp_match = re.search(r'(\d+)\s*degrees?', command)
            if temp_match:
                temperature = int(temp_match.group(1))
                climate_devices = home_assistant_service.get_climate_devices()
                if climate_devices:
                    home_assistant_service.set_temperature(climate_devices[0]['entity_id'], temperature)
                    response_text = f"Temperature set to {temperature} degrees"
                    success = True
        
        elif 'good morning' in command or 'morning routine' in command:
            result = home_assistant_service.trigger_automation('automation.good_morning')
            if result:
                response_text = "Good morning! Starting your morning routine."
                success = True
        
        elif 'good night' in command or 'night routine' in command or 'bedtime' in command:
            result = home_assistant_service.trigger_automation('automation.good_night')
            if result:
                response_text = "Good night! Starting your bedtime routine."
                success = True
        
        elif 'movie time' in command or 'movie mode' in command:
            result = home_assistant_service.trigger_automation('automation.movie_time')
            if result:
                response_text = "Activating movie mode. Enjoy the show!"
                success = True
        
        return jsonify({
            'success': success,
            'command': command,
            'response': response_text,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error processing voice command: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/status', methods=['GET'])
@require_auth
def get_smart_home_status():
    """Get smart home system status"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({
                'success': False,
                'status': 'disabled',
                'error': 'Home Assistant not configured'
            }), 503
        
        connected = home_assistant_service.check_connection()
        
        if not connected:
            return jsonify({
                'success': False,
                'status': 'disconnected',
                'error': 'Cannot connect to Home Assistant'
            }), 503
        
        devices = home_assistant_service.get_devices()
        lights = [d for d in devices if d['domain'] == 'light']
        switches = [d for d in devices if d['domain'] == 'switch']
        sensors = [d for d in devices if d['domain'] == 'sensor']
        climate = [d for d in devices if d['domain'] == 'climate']
        
        return jsonify({
            'success': True,
            'status': 'connected',
            'url': home_assistant_service.base_url,
            'device_counts': {
                'total': len(devices),
                'lights': len(lights),
                'switches': len(switches),
                'sensors': len(sensors),
                'climate': len(climate)
            },
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting status: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
