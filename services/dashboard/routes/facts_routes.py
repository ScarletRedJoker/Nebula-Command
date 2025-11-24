"""Stream-Bot Facts Display Routes"""
import logging
from flask import Blueprint, render_template, jsonify
from utils.auth import require_web_auth
from services.db_service import db_service
from models.artifact import Artifact
from sqlalchemy import desc

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
    """Get latest facts from stream-bot
    
    Query params:
        limit: Number of facts to return (default: 20, max: 100)
        
    Returns:
        JSON with list of facts
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        from flask import request
        limit = min(int(request.args.get('limit', 20)), 100)
        
        with db_service.get_session() as session:
            # Query artifacts where type is 'fact'
            facts = session.query(Artifact).filter(
                Artifact.artifact_type == 'fact'
            ).order_by(
                desc(Artifact.created_at)
            ).limit(limit).all()
            
            facts_data = []
            for fact in facts:
                facts_data.append({
                    'id': str(fact.id),
                    'content': fact.data.get('fact', fact.content) if fact.data else fact.content,
                    'source': fact.source,
                    'created_at': fact.created_at.isoformat() if fact.created_at else None,
                    'tags': fact.tags or []
                })
            
            return jsonify({
                'success': True,
                'count': len(facts_data),
                'facts': facts_data
            })
            
    except Exception as e:
        logger.error(f"Error fetching facts: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@facts_bp.route('/api/facts/random', methods=['GET'])
@require_web_auth
def get_random_fact():
    """Get a random fact from the database
    
    Returns:
        JSON with a single random fact
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        from sqlalchemy.sql.expression import func
        
        with db_service.get_session() as session:
            # Get random fact
            fact = session.query(Artifact).filter(
                Artifact.artifact_type == 'fact'
            ).order_by(func.random()).first()
            
            if not fact:
                return jsonify({
                    'success': True,
                    'fact': None,
                    'message': 'No facts available yet'
                })
            
            return jsonify({
                'success': True,
                'fact': {
                    'id': str(fact.id),
                    'content': fact.data.get('fact', fact.content) if fact.data else fact.content,
                    'source': fact.source,
                    'created_at': fact.created_at.isoformat() if fact.created_at else None
                }
            })
            
    except Exception as e:
        logger.error(f"Error fetching random fact: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
