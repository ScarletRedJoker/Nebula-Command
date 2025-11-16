"""Domain Worker - Celery tasks for autonomous domain management

This module provides async Celery tasks for:
- DNS record health checks
- SSL certificate monitoring
- Domain health monitoring
- Autonomous domain provisioning workflows
"""

import logging
from celery import shared_task
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import uuid

from models import get_session, DomainRecord, DomainEvent, DomainTask
from services.enhanced_domain_service import EnhancedDomainService
from integrations.zoneedit_service import ZoneEditService
from integrations.caddy_service import CaddyService

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def check_domain_health_task(self, domain_id: str) -> Dict[str, Any]:
    """Celery task to check health of a single domain
    
    Args:
        domain_id: UUID of domain record
        
    Returns:
        Health check results
    """
    try:
        logger.info(f"Starting health check for domain {domain_id}")
        
        service = EnhancedDomainService()
        success, result = service.check_domain_health(domain_id)
        
        if not success:
            logger.warning(f"Health check failed for domain {domain_id}: {result}")
        
        return result
        
    except Exception as e:
        logger.error(f"Health check task error for domain {domain_id}: {e}")
        
        # Retry on failure
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        
        return {
            'error': 'Health check failed',
            'message': str(e),
            'domain_id': domain_id
        }


@shared_task(bind=True)
def check_all_domains_health_task(self) -> Dict[str, Any]:
    """Celery task to check health of all domains
    
    Returns:
        Health summary for all domains
    """
    try:
        logger.info("Starting health check for all domains")
        
        service = EnhancedDomainService()
        success, result = service.check_all_domains_health()
        
        logger.info(f"Health check complete: {result.get('total', 0)} domains checked")
        
        return result
        
    except Exception as e:
        logger.error(f"All domains health check error: {e}")
        return {
            'error': 'Health check failed',
            'message': str(e),
            'domains': []
        }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def monitor_ssl_expiry_task(self) -> Dict[str, Any]:
    """Celery task to monitor SSL certificate expiry for all domains
    
    Returns:
        SSL expiry report
    """
    session = None
    try:
        logger.info("Starting SSL expiry monitoring")
        
        session = get_session()
        
        # Get all SSL-enabled domains
        ssl_domains = session.query(DomainRecord).filter(
            DomainRecord.ssl_enabled == True
        ).all()
        
        expiring_soon = []
        expired = []
        healthy = []
        
        service = EnhancedDomainService()
        
        for domain in ssl_domains:
            success, health = service.check_domain_health(str(domain.id))
            
            if success and health.get('ssl_days_remaining') is not None:
                days_remaining = health['ssl_days_remaining']
                
                if days_remaining < 0:
                    expired.append({
                        'domain': domain.full_domain,
                        'days_remaining': days_remaining,
                        'domain_id': str(domain.id)
                    })
                elif days_remaining < 30:
                    expiring_soon.append({
                        'domain': domain.full_domain,
                        'days_remaining': days_remaining,
                        'domain_id': str(domain.id)
                    })
                else:
                    healthy.append({
                        'domain': domain.full_domain,
                        'days_remaining': days_remaining,
                        'domain_id': str(domain.id)
                    })
        
        result = {
            'total_ssl_domains': len(ssl_domains),
            'expired': expired,
            'expiring_soon': expiring_soon,
            'healthy': healthy,
            'checked_at': datetime.utcnow().isoformat()
        }
        
        # Create alerts for expiring certificates
        for domain_info in expiring_soon:
            days = domain_info['days_remaining']
            domain_id = uuid.UUID(domain_info['domain_id'])
            
            alert_event = DomainEvent.create_event(
                event_type='ssl_expiring_soon' if days >= 7 else 'ssl_expiring_critical',
                event_category='alert',
                message=f'SSL certificate expiring in {days} days',
                status='warning' if days >= 7 else 'critical',
                domain_record_id=domain_id,
                details={'days_remaining': days, 'domain': domain_info['domain']},
                triggered_by='ssl_monitor'
            )
            session.add(alert_event)
            
            # Trigger auto-renewal for certificates expiring in < 7 days
            if days < 7:
                logger.warning(f"Triggering auto-renewal for {domain_info['domain']} (expires in {days} days)")
                from workers.domain_worker import renew_ssl_certificate_task
                renew_ssl_certificate_task.delay(str(domain_id))
        
        # Create alerts for expired certificates
        for domain_info in expired:
            domain_id = uuid.UUID(domain_info['domain_id'])
            
            alert_event = DomainEvent.create_event(
                event_type='ssl_expired',
                event_category='alert',
                message=f'SSL certificate has EXPIRED',
                status='critical',
                domain_record_id=domain_id,
                details={'days_remaining': domain_info['days_remaining'], 'domain': domain_info['domain']},
                triggered_by='ssl_monitor'
            )
            session.add(alert_event)
        
        session.commit()
        
        # Log critical SSL issues
        if expired:
            logger.error(f"CRITICAL: {len(expired)} SSL certificates have EXPIRED!")
        if expiring_soon:
            logger.warning(f"WARNING: {len(expiring_soon)} SSL certificates expiring within 30 days")
        
        logger.info(f"SSL monitoring complete: {len(healthy)} healthy, {len(expiring_soon)} expiring soon, {len(expired)} expired")
        
        return result
        
    except Exception as e:
        logger.error(f"SSL expiry monitoring error: {e}")
        return {
            'error': 'SSL monitoring failed',
            'message': str(e)
        }
    finally:
        if session:
            session.close()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def renew_ssl_certificate_task(self, domain_id: str) -> Dict[str, Any]:
    """Celery task to renew SSL certificate for a domain
    
    This triggers a force renewal by temporarily removing and re-adding the domain to Caddy.
    
    Args:
        domain_id: UUID of domain record
        
    Returns:
        Renewal result
    """
    session = None
    try:
        logger.info(f"Starting SSL renewal for domain {domain_id}")
        
        session = get_session()
        domain_record = session.query(DomainRecord).filter(
            DomainRecord.id == uuid.UUID(domain_id)
        ).first()
        
        if not domain_record:
            return {
                'success': False,
                'error': 'Domain not found',
                'domain_id': domain_id
            }
        
        full_domain = domain_record.full_domain
        caddy = CaddyService()
        
        # Log renewal start
        start_event = DomainEvent.create_event(
            event_type='ssl_renewal_started',
            event_category='ssl',
            message=f'Starting SSL certificate renewal for {full_domain}',
            status='info',
            domain_record_id=domain_record.id,
            triggered_by='ssl_monitor'
        )
        session.add(start_event)
        session.commit()
        
        # STEP 1: Backup current Caddyfile
        logger.info("Step 1: Backing up Caddyfile")
        backup_success, backup_message = caddy.backup_caddyfile()
        if not backup_success:
            logger.warning(f"Caddyfile backup failed: {backup_message}")
        
        # STEP 2: Remove domain from Caddyfile
        logger.info(f"Step 2: Removing {full_domain} from Caddyfile")
        remove_success, remove_message = caddy.remove_domain_from_caddyfile(full_domain)
        if not remove_success:
            raise Exception(f"Failed to remove domain from Caddyfile: {remove_message}")
        
        # STEP 3: Reload Caddy (releases old certificate)
        logger.info("Step 3: Reloading Caddy to release old certificate")
        reload1_success, reload1_message = caddy.reload_caddy()
        if not reload1_success:
            raise Exception(f"Caddy reload failed: {reload1_message}")
        
        import time
        time.sleep(5)
        
        # STEP 4: Re-add domain to Caddyfile
        logger.info(f"Step 4: Re-adding {full_domain} to Caddyfile")
        target_port = domain_record.port or 80
        container_name = domain_record.container_name
        
        if container_name:
            target_url = f"http://{container_name}:{target_port}"
        else:
            target_url = f"http://localhost:{target_port}"
        
        add_success, add_message = caddy.add_domain_to_caddyfile(
            domain=full_domain,
            target_url=target_url,
            ssl_enabled=True,
            custom_config=domain_record.custom_caddy_config if hasattr(domain_record, 'custom_caddy_config') else None
        )
        if not add_success:
            raise Exception(f"Failed to re-add domain to Caddyfile: {add_message}")
        
        # STEP 5: Reload Caddy (obtains new certificate)
        logger.info("Step 5: Reloading Caddy to obtain new certificate")
        reload2_success, reload2_message = caddy.reload_caddy()
        if not reload2_success:
            raise Exception(f"Caddy reload failed: {reload2_message}")
        
        # STEP 6: Wait for new certificate
        logger.info("Step 6: Waiting for new SSL certificate")
        time.sleep(30)
        
        # STEP 7: Verify new certificate
        logger.info("Step 7: Verifying new certificate")
        service = EnhancedDomainService()
        success, health = service.check_domain_health(str(domain_record.id))
        
        if success and health.get('ssl_valid'):
            logger.info(f"SSL certificate renewed successfully for {full_domain}")
            
            # Log renewal success
            success_event = DomainEvent.create_event(
                event_type='ssl_renewed',
                event_category='ssl',
                message=f'SSL certificate renewed successfully for {full_domain}',
                status='success',
                domain_record_id=domain_record.id,
                details={
                    'ssl_expires': health.get('ssl_expires'),
                    'ssl_days_remaining': health.get('ssl_days_remaining')
                },
                triggered_by='ssl_monitor'
            )
            session.add(success_event)
            session.commit()
            
            return {
                'success': True,
                'message': 'SSL certificate renewed successfully',
                'domain': full_domain,
                'ssl_expires': health.get('ssl_expires'),
                'ssl_days_remaining': health.get('ssl_days_remaining')
            }
        else:
            raise Exception(f"SSL certificate verification failed after renewal")
        
    except Exception as e:
        logger.error(f"SSL renewal failed for domain {domain_id}: {e}")
        
        # Log renewal failure
        if session and domain_record:
            fail_event = DomainEvent.create_event(
                event_type='ssl_renewal_failed',
                event_category='alert',
                message=f'SSL renewal failed: {str(e)}',
                status='critical',
                domain_record_id=domain_record.id,
                error_details={'error': str(e)},
                triggered_by='ssl_monitor'
            )
            session.add(fail_event)
            session.commit()
        
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        
        return {
            'success': False,
            'error': 'SSL renewal failed',
            'message': str(e),
            'domain_id': domain_id
        }
    finally:
        if session:
            session.close()


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def provision_domain_task(self, domain_id: str) -> Dict[str, Any]:
    """Celery task to autonomously provision a domain
    
    This is the core autonomous provisioning workflow:
    1. Validate domain in database
    2. Create DNS records via ZoneEdit
    3. Wait for DNS propagation
    4. Generate Caddyfile entry
    5. Reload Caddy
    6. Wait for SSL certificate
    7. Verify HTTPS endpoint
    8. Mark domain as active
    
    Args:
        domain_id: UUID of domain record to provision
        
    Returns:
        Provisioning result
    """
    session = None
    try:
        logger.info(f"Starting autonomous provisioning for domain {domain_id}")
        
        session = get_session()
        
        domain_record = session.query(DomainRecord).filter(
            DomainRecord.id == uuid.UUID(domain_id)
        ).first()
        
        if not domain_record:
            return {
                'success': False,
                'error': 'Domain not found',
                'domain_id': domain_id
            }
        
        # Create provisioning task
        task = DomainTask.create_provision_task(
            domain_record_id=domain_record.id,
            created_by='celery_worker',
            priority=5,
            metadata={
                'celery_task_id': self.request.id,
                'started_at': datetime.utcnow().isoformat()
            }
        )
        session.add(task)
        session.commit()
        
        # Update provisioning status
        domain_record.provisioning_status = 'provisioning'
        session.commit()
        
        # Log provisioning start event
        start_event = DomainEvent(
            domain_record_id=domain_record.id,
            event_type='provision_started',
            details=f'Starting autonomous provisioning for {domain_record.full_domain}',
            success=True
        )
        session.add(start_event)
        session.commit()
        
        # Initialize services
        zoneedit = ZoneEditService()
        caddy = CaddyService()
        
        try:
            # STEP 1: Get public IP
            logger.info("Step 1: Detecting public IP")
            public_ip = zoneedit.get_public_ip()
            if not public_ip:
                raise Exception("Failed to detect public IP address")
            
            logger.info(f"Public IP detected: {public_ip}")
            domain_record.record_value = public_ip
            session.commit()
            
            # Log IP detection event
            ip_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='ip_detected',
                details=f'Public IP detected: {public_ip}',
                success=True
            )
            session.add(ip_event)
            session.commit()
            
            # STEP 2: Create DNS record via ZoneEdit
            logger.info("Step 2: Creating DNS record via ZoneEdit")
            zone = domain_record.domain
            host = domain_record.subdomain
            
            dns_success, dns_result = zoneedit.create_record(
                zone=zone,
                record_type='A',
                host=host,
                value=public_ip,
                ttl=domain_record.ttl or 300
            )
            
            if not dns_success:
                raise Exception(f"DNS record creation failed: {dns_result.get('error', 'Unknown error')}")
            
            logger.info(f"DNS record created: {host}.{zone} -> {public_ip}")
            domain_record.zoneedit_record_id = dns_result.get('record_id')
            session.commit()
            
            # Log DNS creation event
            dns_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='dns_record_created',
                details=f'DNS A record created: {host}.{zone} -> {public_ip}',
                success=True
            )
            session.add(dns_event)
            session.commit()
            
            # STEP 3: Wait for DNS propagation
            logger.info("Step 3: Waiting for DNS propagation")
            import time
            time.sleep(10)
            
            propagation_success, propagation_result = zoneedit.verify_propagation(
                domain=domain_record.full_domain,
                expected_ip=public_ip,
                max_attempts=10
            )
            
            domain_record.dns_propagation_status = 'propagated' if propagation_success else 'pending'
            session.commit()
            
            # Log DNS propagation event
            prop_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='dns_propagation_verified',
                details=f'DNS propagation: {propagation_result.get("propagation_percentage", 0)}% complete',
                success=propagation_success
            )
            session.add(prop_event)
            session.commit()
            
            if not propagation_success:
                logger.warning("DNS not fully propagated, continuing anyway...")
            
            # STEP 4: Generate and add Caddy config
            logger.info("Step 4: Adding domain to Caddy")
            target_port = domain_record.port or 80
            container_name = domain_record.container_name
            
            if container_name:
                target_url = f"http://{container_name}:{target_port}"
            else:
                target_url = f"http://localhost:{target_port}"
            
            caddy_success, caddy_message = caddy.add_domain_to_caddyfile(
                domain=domain_record.full_domain,
                target_url=target_url,
                ssl_enabled=domain_record.ssl_enabled,
                custom_config=domain_record.custom_caddy_config
            )
            
            if not caddy_success:
                raise Exception(f"Failed to add domain to Caddy: {caddy_message}")
            
            logger.info(f"Domain added to Caddyfile: {domain_record.full_domain}")
            
            # Log Caddy config event
            caddy_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='caddy_config_added',
                details=f'Domain added to Caddyfile: {domain_record.full_domain} -> {target_url}',
                success=True
            )
            session.add(caddy_event)
            session.commit()
            
            # STEP 5: Reload Caddy
            logger.info("Step 5: Reloading Caddy")
            reload_success, reload_message = caddy.reload_caddy()
            
            if not reload_success:
                raise Exception(f"Caddy reload failed: {reload_message}")
            
            logger.info("Caddy reloaded successfully")
            
            # Log Caddy reload event
            reload_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='caddy_reloaded',
                details='Caddy configuration reloaded successfully',
                success=True
            )
            session.add(reload_event)
            session.commit()
            
            # STEP 6: Wait for SSL certificate
            if domain_record.ssl_enabled:
                logger.info("Step 6: Waiting for SSL certificate")
                time.sleep(45)
                
                cert_valid, cert_info = caddy.get_certificate_status(domain_record.full_domain)
                
                # Log SSL certificate event
                ssl_event = DomainEvent(
                    domain_record_id=domain_record.id,
                    event_type='ssl_certificate_obtained',
                    details=f'SSL certificate status: {cert_info.get("status", "unknown")}',
                    success=cert_valid
                )
                session.add(ssl_event)
                session.commit()
                
                if cert_valid:
                    logger.info(f"SSL certificate obtained for {domain_record.full_domain}")
                else:
                    logger.warning(f"SSL certificate not yet available for {domain_record.full_domain}")
            
            # STEP 7: Verify HTTPS endpoint (basic check)
            logger.info("Step 7: Verifying domain endpoint")
            import requests
            protocol = 'https' if domain_record.ssl_enabled else 'http'
            
            try:
                response = requests.get(
                    f"{protocol}://{domain_record.full_domain}",
                    timeout=10,
                    verify=False
                )
                
                domain_record.http_status_code = response.status_code
                domain_record.last_health_check_at = datetime.utcnow()
                session.commit()
                
                # Log endpoint verification event
                endpoint_event = DomainEvent(
                    domain_record_id=domain_record.id,
                    event_type='endpoint_verified',
                    details=f'Endpoint responding with status {response.status_code}',
                    success=True
                )
                session.add(endpoint_event)
                session.commit()
                
                logger.info(f"Endpoint verified: {response.status_code}")
            except Exception as e:
                logger.warning(f"Endpoint verification failed: {e}")
                # Not critical, continue
            
            # STEP 8: Mark domain as active
            logger.info("Step 8: Marking domain as active")
            domain_record.provisioning_status = 'active'
            domain_record.updated_at = datetime.utcnow()
            session.commit()
            
            # Mark task as completed
            task.mark_completed({
                'provisioned': True,
                'domain': domain_record.full_domain,
                'ip': public_ip,
                'ssl_enabled': domain_record.ssl_enabled,
                'completed_at': datetime.utcnow().isoformat()
            })
            session.commit()
            
            # Log completion event
            complete_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='provision_completed',
                details=f'Domain {domain_record.full_domain} successfully provisioned',
                success=True
            )
            session.add(complete_event)
            session.commit()
            
            logger.info(f"Domain {domain_record.full_domain} successfully provisioned!")
            
            return {
                'success': True,
                'message': 'Domain provisioned successfully',
                'domain_id': domain_id,
                'domain': domain_record.full_domain,
                'ip': public_ip,
                'task_id': str(task.id)
            }
            
        except Exception as provision_error:
            logger.error(f"Provisioning failed at some step: {provision_error}")
            
            # Mark domain as error
            domain_record.provisioning_status = 'error'
            domain_record.error_message = str(provision_error)
            session.commit()
            
            # Mark task as failed
            task.mark_failed(str(provision_error))
            session.commit()
            
            # Log failure event
            fail_event = DomainEvent(
                domain_record_id=domain_record.id,
                event_type='provision_failed',
                details=f'Provisioning failed: {str(provision_error)}',
                success=False
            )
            session.add(fail_event)
            session.commit()
            
            raise provision_error
        
    except Exception as e:
        logger.error(f"Domain provisioning error for {domain_id}: {e}")
        
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        
        return {
            'success': False,
            'error': 'Provisioning failed',
            'message': str(e),
            'domain_id': domain_id
        }
    finally:
        if session:
            session.close()


# Periodic tasks (configured in celerybeat schedule)
@shared_task
def periodic_health_check():
    """Periodic task to check all domains health (run every 5 minutes)"""
    return check_all_domains_health_task.delay()


@shared_task
def periodic_ssl_monitoring():
    """Periodic task to monitor SSL expiry (run daily)"""
    return monitor_ssl_expiry_task.delay()
