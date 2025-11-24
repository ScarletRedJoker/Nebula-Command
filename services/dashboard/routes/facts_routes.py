"""Stream-Bot Facts Display Routes - READ-ONLY proxy to stream-bot"""
import logging
from flask import Blueprint, render_template, jsonify
from utils.auth import require_web_auth

logger = logging.getLogger(__name__)

facts_bp = Blueprint('facts', __name__)


@facts_bp.route('/facts')
@require_web_auth
def facts_page():
    """Display stream-bot generated facts"""
    return render_template('facts.html')


@facts_bp.route('/api/facts/latest', methods=['GET'])
@require_web_auth
def get_latest_facts():
    """Proxy to stream-bot facts API
    
    Returns:
        JSON with list of facts from stream-bot
    """
    import os
    import requests
    
    try:
        stream_bot_url = os.environ.get('STREAM_BOT_URL', 'http://stream-bot:5000')
        response = requests.get(f'{stream_bot_url}/api/facts/latest', timeout=5)
        
        if response.ok:
            return jsonify(response.json())
        else:
            return jsonify({
                'success': False,
                'error': 'Stream-bot API unavailable'
            }), 503
            
    except Exception as e:
        logger.error(f"Error fetching facts from stream-bot: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Stream-bot unavailable'
        }), 503


@facts_bp.route('/api/facts/random', methods=['GET'])
@require_web_auth
def get_random_fact():
    """Proxy to stream-bot random fact API
    
    Returns:
        JSON with a random fact from stream-bot
    """
    import os
    import requests
    
    try:
        stream_bot_url = os.environ.get('STREAM_BOT_URL', 'http://stream-bot:5000')
        response = requests.get(f'{stream_bot_url}/api/facts/random', timeout=5)
        
        if response.ok:
            return jsonify(response.json())
        else:
            return jsonify({
                'success': False,
                'error': 'Stream-bot API unavailable'
            }), 503
            
    except Exception as e:
        logger.error(f"Error fetching random fact from stream-bot: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Stream-bot unavailable'
        }), 503
