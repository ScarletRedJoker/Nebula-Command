#!/usr/bin/env python3
"""
Migrate Hardcoded Domains to Database

This script migrates hardcoded domains from the old DomainService
to database-backed domain records. This is a one-time migration.

Usage:
    python scripts/migrate_hardcoded_domains.py
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import get_session, DomainRecord, DomainEvent, RecordType, RecordStatus
from services.domain_service import DomainService
from services.enhanced_domain_service import EnhancedDomainService
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_hardcoded_domains():
    """Migrate hardcoded domains to database"""
    
    session = get_session()
    enhanced_service = EnhancedDomainService()
    
    try:
        # Check if migration already done
        existing_count = session.query(DomainRecord).count()
        if existing_count > 0:
            logger.info(f"Database already has {existing_count} domains. Skipping migration.")
            logger.info("If you want to re-migrate, please empty the domain_records table first.")
            return {
                'success': False,
                'message': 'Migration already completed',
                'existing_domains': existing_count
            }
        
        logger.info("Starting hardcoded domain migration...")
        
        # Get hardcoded domains from old service
        hardcoded_domains = DomainService.DOMAINS
        
        migrated = []
        failed = []
        
        for domain_config in hardcoded_domains:
            try:
                logger.info(f"Migrating: {domain_config['name']}")
                
                # Parse URL to get domain parts
                url = domain_config['url']
                subdomain = domain_config['subdomain']
                
                # Determine base domain
                if 'evindrake.net' in subdomain:
                    base_domain = 'evindrake.net'
                    sub = subdomain.replace('.evindrake.net', '')
                elif 'rig-city.com' in subdomain:
                    base_domain = 'rig-city.com'
                    sub = subdomain.replace('.rig-city.com', '')
                elif 'scarletredjoker.com' in subdomain:
                    base_domain = 'scarletredjoker.com'
                    sub = '@'  # Root domain
                else:
                    base_domain = subdomain
                    sub = '@'
                
                # Check if domain already exists
                existing = session.query(DomainRecord).filter(
                    DomainRecord.domain == base_domain,
                    DomainRecord.subdomain == sub
                ).first()
                
                if existing:
                    logger.warning(f"Domain {sub}.{base_domain} already exists, skipping")
                    continue
                
                # Determine port based on service type
                port_mapping = {
                    'web': 5000,
                    'media': 32400,
                    'automation': 5678,
                    'static': 80,
                    'proxy': 8080
                }
                
                port = port_mapping.get(domain_config['type'], 80)
                
                # Create domain record
                success, result = enhanced_service.create_domain(
                    domain=base_domain,
                    subdomain=sub,
                    service_name=domain_config['name'],
                    service_type=domain_config['type'],
                    container_name=domain_config.get('container'),
                    port=port,
                    ssl_enabled=url.startswith('https://'),
                    auto_ssl=True,
                    auto_managed=True,
                    dns_provider='zoneedit',
                    notes=f"Migrated from hardcoded configuration on {datetime.utcnow().isoformat()}",
                    created_by='migration_script'
                )
                
                if success:
                    logger.info(f"✓ Migrated: {domain_config['name']} -> {result['full_domain']}")
                    migrated.append({
                        'name': domain_config['name'],
                        'domain': result['full_domain'],
                        'id': result['id']
                    })
                else:
                    error_msg = result.get('message', 'Unknown error')
                    logger.error(f"✗ Failed to migrate {domain_config['name']}: {error_msg}")
                    failed.append({
                        'name': domain_config['name'],
                        'error': error_msg
                    })
                
            except Exception as e:
                logger.error(f"✗ Error migrating {domain_config['name']}: {e}")
                failed.append({
                    'name': domain_config['name'],
                    'error': str(e)
                })
        
        # Create migration completion event
        migration_event = DomainEvent.create_event(
            event_type='migration_completed',
            event_category='system',
            message=f'Migrated {len(migrated)} hardcoded domains to database',
            status='success',
            details={
                'migrated_count': len(migrated),
                'failed_count': len(failed),
                'migrated_domains': migrated,
                'failed_domains': failed
            },
            triggered_by='migration_script'
        )
        session.add(migration_event)
        session.commit()
        
        logger.info("\n" + "="*60)
        logger.info("MIGRATION SUMMARY")
        logger.info("="*60)
        logger.info(f"Successfully migrated: {len(migrated)} domains")
        logger.info(f"Failed migrations: {len(failed)} domains")
        logger.info("="*60)
        
        if migrated:
            logger.info("\nMigrated domains:")
            for domain in migrated:
                logger.info(f"  ✓ {domain['name']}: {domain['domain']}")
        
        if failed:
            logger.info("\nFailed migrations:")
            for failure in failed:
                logger.info(f"  ✗ {failure['name']}: {failure['error']}")
        
        return {
            'success': True,
            'migrated': migrated,
            'failed': failed,
            'total_migrated': len(migrated),
            'total_failed': len(failed)
        }
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        session.rollback()
        return {
            'success': False,
            'error': str(e)
        }
    finally:
        session.close()


if __name__ == '__main__':
    print("\n" + "="*60)
    print("HARDCODED DOMAIN MIGRATION SCRIPT")
    print("="*60)
    print("\nThis script will migrate hardcoded domains from")
    print("DomainService.DOMAINS to the database.\n")
    
    response = input("Do you want to proceed? (yes/no): ")
    if response.lower() != 'yes':
        print("Migration cancelled.")
        sys.exit(0)
    
    result = migrate_hardcoded_domains()
    
    if result['success']:
        print("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        print(f"\n✗ Migration failed: {result.get('error', result.get('message', 'Unknown error'))}")
        sys.exit(1)
