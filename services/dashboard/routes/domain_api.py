"""Domain Management API Endpoints

REST API for CRUD operations on domains with database integration.
Supports autonomous domain provisioning workflow.
"""

from flask import Blueprint, jsonify, request
from utils.auth import require_auth
from services.enhanced_domain_service import EnhancedDomainService
import logging

logger = logging.getLogger(__name__)

domain_api_bp = Blueprint('domain_api', __name__, url_prefix='/api/domains')

# Initialize service
domain_service = EnhancedDomainService()


@domain_api_bp.route('/', methods=['GET'])
@require_auth
def list_domains():
    """List all domains with optional filtering
    
    Query Parameters:
        service_type: Filter by service type (web, api, media, etc.)
        status: Filter by provisioning status (pending, active, failed)
        limit: Maximum number of results (default: 100)
        offset: Pagination offset (default: 0)
        
    Returns:
        JSON response with list of domains
    """
    try:
        service_type = request.args.get('service_type')
        status = request.args.get('status')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        success, result = domain_service.list_domains(
            service_type=service_type,
            status=status,
            limit=limit,
            offset=offset
        )
        
        if success:
            return jsonify({
                'success': True,
                'data': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error'),
                'message': result.get('message', '')
            }), 400
            
    except Exception as e:
        logger.error(f"Error listing domains: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>', methods=['GET'])
@require_auth
def get_domain(domain_id):
    """Get a specific domain by ID
    
    Args:
        domain_id: UUID of the domain record
        
    Returns:
        JSON response with domain details
    """
    try:
        success, result = domain_service.get_domain(domain_id)
        
        if success:
            return jsonify({
                'success': True,
                'data': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Not found'),
                'message': result.get('message', '')
            }), 404
            
    except Exception as e:
        logger.error(f"Error getting domain {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/', methods=['POST'])
@require_auth
def create_domain():
    """Create a new domain record
    
    Request JSON Body:
        {
            "domain": "rig-city.com",
            "subdomain": "api",
            "service_name": "API Server",
            "service_type": "api",
            "container_name": "api-server",
            "port": 3000,
            "ssl_enabled": true,
            "auto_ssl": true,
            "auto_managed": true,
            "dns_provider": "zoneedit",
            "notes": "Production API endpoint"
        }
        
    Returns:
        JSON response with created domain
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request',
                'message': 'Request body must be JSON'
            }), 400
        
        # Required fields
        required_fields = ['domain', 'subdomain', 'service_name', 'service_type']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'message': f'Missing: {", ".join(missing_fields)}'
            }), 400
        
        success, result = domain_service.create_domain(
            domain=data['domain'],
            subdomain=data['subdomain'],
            service_name=data['service_name'],
            service_type=data['service_type'],
            container_name=data.get('container_name'),
            port=data.get('port'),
            ssl_enabled=data.get('ssl_enabled', True),
            auto_ssl=data.get('auto_ssl', True),
            auto_managed=data.get('auto_managed', True),
            dns_provider=data.get('dns_provider', 'zoneedit'),
            record_value=data.get('record_value'),
            notes=data.get('notes'),
            created_by=request.remote_addr or 'web'
        )
        
        if success:
            return jsonify({
                'success': True,
                'data': result,
                'message': f'Domain {result["full_domain"]} created successfully'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Creation failed'),
                'message': result.get('message', '')
            }), 400
            
    except Exception as e:
        logger.error(f"Error creating domain: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_domain(domain_id):
    """Update an existing domain record
    
    Args:
        domain_id: UUID of the domain record
        
    Request JSON Body:
        {
            "service_name": "Updated API Server",
            "port": 3001,
            "notes": "Updated configuration"
        }
        
    Returns:
        JSON response with updated domain
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request',
                'message': 'Request body must be JSON'
            }), 400
        
        success, result = domain_service.update_domain(
            domain_id=domain_id,
            updates=data,
            updated_by=request.remote_addr or 'web'
        )
        
        if success:
            return jsonify({
                'success': True,
                'data': result,
                'message': f'Domain updated successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Update failed'),
                'message': result.get('message', '')
            }), 400
            
    except Exception as e:
        logger.error(f"Error updating domain {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>', methods=['DELETE'])
@require_auth
def delete_domain(domain_id):
    """Delete a domain record
    
    Args:
        domain_id: UUID of the domain record
        
    Returns:
        JSON response confirming deletion
    """
    try:
        success, result = domain_service.delete_domain(
            domain_id=domain_id,
            deleted_by=request.remote_addr or 'web'
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': result['message']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Deletion failed'),
                'message': result.get('message', '')
            }), 400
            
    except Exception as e:
        logger.error(f"Error deleting domain {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>/health', methods=['GET'])
@require_auth
def check_domain_health(domain_id):
    """Check health status of a specific domain
    
    Args:
        domain_id: UUID of the domain record
        
    Returns:
        JSON response with health check results
    """
    try:
        success, result = domain_service.check_domain_health(domain_id)
        
        if success:
            return jsonify({
                'success': True,
                'data': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Health check failed'),
                'message': result.get('message', '')
            }), 400
            
    except Exception as e:
        logger.error(f"Error checking domain health {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/health/all', methods=['GET'])
@require_auth
def check_all_domains_health():
    """Check health status of all domains
    
    Returns:
        JSON response with health summary and individual results
    """
    try:
        success, result = domain_service.check_all_domains_health()
        
        if success:
            return jsonify({
                'success': True,
                'data': result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Health check failed'),
                'data': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error checking all domains health: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>/events', methods=['GET'])
@require_auth
def get_domain_events(domain_id):
    """Get audit events for a domain
    
    Args:
        domain_id: UUID of the domain record
        
    Query Parameters:
        limit: Maximum number of events (default: 50)
        offset: Pagination offset (default: 0)
        
    Returns:
        JSON response with domain events
    """
    try:
        from models import get_session, DomainEvent
        import uuid as uuid_lib
        
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        
        session = get_session()
        try:
            events = session.query(DomainEvent).filter(
                DomainEvent.domain_record_id == uuid_lib.UUID(domain_id)
            ).order_by(DomainEvent.created_at.desc()).limit(limit).offset(offset).all()
            
            total_count = session.query(DomainEvent).filter(
                DomainEvent.domain_record_id == uuid_lib.UUID(domain_id)
            ).count()
            
            return jsonify({
                'success': True,
                'data': {
                    'events': [event.to_dict() for event in events],
                    'total': total_count,
                    'limit': limit,
                    'offset': offset
                }
            }), 200
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error getting domain events {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/summary', methods=['GET'])
@require_auth
def get_domain_summary():
    """Get summary statistics for all domains
    
    Returns:
        JSON response with domain statistics
    """
    try:
        from models import get_session, DomainRecord
        
        session = get_session()
        try:
            total_domains = session.query(DomainRecord).count()
            active_domains = session.query(DomainRecord).filter(
                DomainRecord.provisioning_status == 'active'
            ).count()
            pending_domains = session.query(DomainRecord).filter(
                DomainRecord.provisioning_status == 'pending'
            ).count()
            failed_domains = session.query(DomainRecord).filter(
                DomainRecord.provisioning_status == 'failed'
            ).count()
            
            # Count by service type
            service_types = {}
            for record in session.query(DomainRecord.service_type).distinct():
                service_type = record[0] or 'unknown'
                count = session.query(DomainRecord).filter(
                    DomainRecord.service_type == record[0]
                ).count()
                service_types[service_type] = count
            
            return jsonify({
                'success': True,
                'data': {
                    'total_domains': total_domains,
                    'active_domains': active_domains,
                    'pending_domains': pending_domains,
                    'failed_domains': failed_domains,
                    'by_service_type': service_types
                }
            }), 200
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error getting domain summary: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500


@domain_api_bp.route('/export', methods=['GET'])
@require_auth
def export_domains():
    """Export all domains to JSON or CSV format
    
    Query Parameters:
        format: Export format ('json' or 'csv', default: 'json')
        service_type: Optional filter by service type
        
    Returns:
        JSON or CSV export file
    """
    try:
        from models import get_session, DomainRecord
        from flask import Response
        import csv
        from io import StringIO
        
        export_format = request.args.get('format', 'json').lower()
        service_type = request.args.get('service_type')
        
        session = get_session()
        try:
            query = session.query(DomainRecord)
            
            if service_type:
                query = query.filter(DomainRecord.service_type == service_type)
            
            domains = query.all()
            
            if export_format == 'csv':
                # CSV export
                output = StringIO()
                writer = csv.writer(output)
                
                # Write header
                writer.writerow([
                    'domain', 'subdomain', 'full_domain', 'service_name', 'service_type',
                    'container_name', 'port', 'ssl_enabled', 'auto_ssl', 'auto_managed',
                    'dns_provider', 'provisioning_status', 'health_status', 'notes'
                ])
                
                # Write data
                for domain in domains:
                    writer.writerow([
                        domain.domain,
                        domain.subdomain,
                        domain.full_domain,
                        domain.service_name,
                        domain.service_type,
                        domain.container_name,
                        domain.port,
                        domain.ssl_enabled,
                        domain.auto_ssl,
                        domain.auto_managed,
                        domain.dns_provider,
                        domain.provisioning_status,
                        domain.health_status,
                        domain.notes
                    ])
                
                csv_data = output.getvalue()
                output.close()
                
                return Response(
                    csv_data,
                    mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename=domains_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv'}
                )
            
            else:
                # JSON export (default)
                export_data = {
                    'exported_at': datetime.utcnow().isoformat(),
                    'total_domains': len(domains),
                    'format': 'json',
                    'domains': []
                }
                
                for domain in domains:
                    export_data['domains'].append({
                        'domain': domain.domain,
                        'subdomain': domain.subdomain,
                        'full_domain': domain.full_domain,
                        'service_name': domain.service_name,
                        'service_type': domain.service_type,
                        'container_name': domain.container_name,
                        'port': domain.port,
                        'ssl_enabled': domain.ssl_enabled,
                        'auto_ssl': domain.auto_ssl,
                        'auto_managed': domain.auto_managed,
                        'dns_provider': domain.dns_provider,
                        'record_value': domain.record_value,
                        'ttl': domain.ttl,
                        'provisioning_status': domain.provisioning_status,
                        'health_status': domain.health_status,
                        'notes': domain.notes
                    })
                
                from flask import make_response
                response = make_response(jsonify(export_data))
                response.headers['Content-Disposition'] = f'attachment; filename=domains_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json'
                return response
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error exporting domains: {e}")
        return jsonify({
            'success': False,
            'error': 'Export failed',
            'message': str(e)
        }), 500


@domain_api_bp.route('/import', methods=['POST'])
@require_auth
def import_domains():
    """Import domains from JSON or CSV file
    
    Request:
        Multipart form data with 'file' field containing JSON or CSV file
        
    Returns:
        JSON response with import summary
    """
    try:
        from models import get_session
        import csv
        from io import StringIO, TextIOWrapper
        
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided',
                'message': 'Please upload a JSON or CSV file'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'message': 'Please select a file to upload'
            }), 400
        
        # Determine file type
        filename = file.filename.lower()
        is_csv = filename.endswith('.csv')
        is_json = filename.endswith('.json')
        
        if not (is_csv or is_json):
            return jsonify({
                'success': False,
                'error': 'Invalid file type',
                'message': 'Only JSON and CSV files are supported'
            }), 400
        
        domains_to_import = []
        
        # Parse file content
        if is_json:
            import json
            try:
                data = json.load(file)
                if isinstance(data, dict) and 'domains' in data:
                    domains_to_import = data['domains']
                elif isinstance(data, list):
                    domains_to_import = data
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Invalid JSON format',
                        'message': 'JSON must contain a "domains" array or be an array of domains'
                    }), 400
            except json.JSONDecodeError as e:
                return jsonify({
                    'success': False,
                    'error': 'Invalid JSON',
                    'message': str(e)
                }), 400
        
        elif is_csv:
            text_stream = TextIOWrapper(file, encoding='utf-8')
            csv_reader = csv.DictReader(text_stream)
            domains_to_import = list(csv_reader)
        
        if not domains_to_import:
            return jsonify({
                'success': False,
                'error': 'No domains found',
                'message': 'The file contains no domains to import'
            }), 400
        
        # Import domains
        imported = []
        failed = []
        skipped = []
        
        for domain_data in domains_to_import:
            try:
                # Required fields
                domain = domain_data.get('domain')
                subdomain = domain_data.get('subdomain')
                service_name = domain_data.get('service_name')
                service_type = domain_data.get('service_type')
                
                if not all([domain, subdomain, service_name, service_type]):
                    failed.append({
                        'domain': domain_data.get('full_domain', 'unknown'),
                        'error': 'Missing required fields (domain, subdomain, service_name, service_type)'
                    })
                    continue
                
                # Convert CSV string booleans to Python booleans
                ssl_enabled = domain_data.get('ssl_enabled', True)
                if isinstance(ssl_enabled, str):
                    ssl_enabled = ssl_enabled.lower() in ('true', '1', 'yes')
                
                auto_ssl = domain_data.get('auto_ssl', True)
                if isinstance(auto_ssl, str):
                    auto_ssl = auto_ssl.lower() in ('true', '1', 'yes')
                
                auto_managed = domain_data.get('auto_managed', True)
                if isinstance(auto_managed, str):
                    auto_managed = auto_managed.lower() in ('true', '1', 'yes')
                
                # Convert port to int if it's a string
                port = domain_data.get('port')
                if port and isinstance(port, str):
                    try:
                        port = int(port)
                    except ValueError:
                        port = None
                
                # Create domain
                success, result = domain_service.create_domain(
                    domain=domain,
                    subdomain=subdomain,
                    service_name=service_name,
                    service_type=service_type,
                    container_name=domain_data.get('container_name'),
                    port=port,
                    ssl_enabled=ssl_enabled,
                    auto_ssl=auto_ssl,
                    auto_managed=auto_managed,
                    dns_provider=domain_data.get('dns_provider', 'zoneedit'),
                    record_value=domain_data.get('record_value'),
                    notes=domain_data.get('notes'),
                    created_by=f'import_{request.remote_addr}'
                )
                
                if success:
                    imported.append({
                        'domain': result['full_domain'],
                        'id': result['id']
                    })
                else:
                    if result.get('error') == 'Duplicate domain':
                        skipped.append({
                            'domain': f"{subdomain}.{domain}",
                            'reason': 'Already exists'
                        })
                    else:
                        failed.append({
                            'domain': f"{subdomain}.{domain}",
                            'error': result.get('message', 'Unknown error')
                        })
                
            except Exception as e:
                logger.error(f"Error importing domain: {e}")
                failed.append({
                    'domain': domain_data.get('full_domain', 'unknown'),
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'message': f'Import completed: {len(imported)} imported, {len(skipped)} skipped, {len(failed)} failed',
            'summary': {
                'total_processed': len(domains_to_import),
                'imported_count': len(imported),
                'skipped_count': len(skipped),
                'failed_count': len(failed),
                'imported': imported[:10],  # First 10
                'skipped': skipped[:10],
                'failed': failed[:10]
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error importing domains: {e}")
        return jsonify({
            'success': False,
            'error': 'Import failed',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>/provision', methods=['POST'])
@require_auth
def provision_domain(domain_id):
    """Trigger domain provisioning workflow
    
    Args:
        domain_id: UUID of domain record
        
    Returns:
        JSON response with task ID
    """
    try:
        from workers.domain_worker import provision_domain_task
        
        # Trigger async provisioning task
        task = provision_domain_task.delay(domain_id)
        
        return jsonify({
            'success': True,
            'message': 'Provisioning started',
            'task_id': task.id,
            'domain_id': domain_id
        }), 202
        
    except Exception as e:
        logger.error(f"Error triggering provisioning for domain {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Provisioning trigger failed',
            'message': str(e)
        }), 500


@domain_api_bp.route('/<domain_id>/alerts', methods=['GET'])
@require_auth
def get_domain_alerts(domain_id):
    """Get active alerts for a specific domain
    
    Args:
        domain_id: UUID of domain record
        
    Returns:
        JSON response with active alerts
    """
    try:
        from models import get_session, DomainEvent
        import uuid as uuid_lib
        
        session = get_session()
        try:
            # Get alert events from last 7 days
            from datetime import timedelta
            cutoff_date = datetime.utcnow() - timedelta(days=7)
            
            alerts = session.query(DomainEvent).filter(
                DomainEvent.domain_record_id == uuid_lib.UUID(domain_id),
                DomainEvent.event_category == 'alert',
                DomainEvent.created_at >= cutoff_date
            ).order_by(DomainEvent.created_at.desc()).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'alerts': [alert.to_dict() for alert in alerts],
                    'total': len(alerts)
                }
            }), 200
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error getting alerts for domain {domain_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal error',
            'message': str(e)
        }), 500
