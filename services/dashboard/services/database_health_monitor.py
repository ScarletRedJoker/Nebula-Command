"""
Autonomous Database Health Monitoring Service
==============================================

Continuously monitors database migration state, enum consistency,
and automatically triggers recovery when issues are detected.

Part of the NASA-grade infrastructure reliability system.
"""

import logging
from typing import Dict, List, Optional, Tuple
from sqlalchemy import text, create_engine
from sqlalchemy.exc import SQLAlchemyError
import os

logger = logging.getLogger(__name__)


class DatabaseHealthMonitor:
    """
    Monitors database health and migration state.
    
    Can be called by Jarvis autonomous monitoring system to:
    - Detect migration failures
    - Verify enum consistency
    - Check for orphaned advisory locks
    - Trigger automatic recovery
    """
    
    def __init__(self):
        self.database_url = os.getenv('JARVIS_DATABASE_URL')
        if not self.database_url:
            logger.warning("JARVIS_DATABASE_URL not set - database monitoring disabled")
            self.enabled = False
        else:
            self.enabled = True
    
    def check_health(self) -> Dict:
        """
        Comprehensive database health check.
        
        Returns:
            Dict with health status:
            {
                "healthy": bool,
                "migration_version": str,
                "migration_consistent": bool,
                "enum_types_valid": bool,
                "advisory_locks_count": int,
                "tables_present": int,
                "tables_expected": int,
                "issues": List[str],
                "recommendations": List[str]
            }
        """
        if not self.enabled:
            return {
                "healthy": False,
                "error": "Database monitoring not configured",
                "issues": ["JARVIS_DATABASE_URL not set"]
            }
        
        health_status = {
            "healthy": True,
            "issues": [],
            "recommendations": []
        }
        
        try:
            engine = create_engine(self.database_url, pool_pre_ping=True)
            
            with engine.connect() as conn:
                # Check 1: Migration version
                migration_info = self._check_migration_version(conn)
                health_status.update(migration_info)
                
                # Check 2: Enum types
                enum_info = self._check_enum_types(conn)
                health_status.update(enum_info)
                
                # Check 3: Advisory locks
                lock_info = self._check_advisory_locks(conn)
                health_status.update(lock_info)
                
                # Check 4: Table consistency
                table_info = self._check_table_consistency(conn, migration_info.get('migration_version'))
                health_status.update(table_info)
                
            # Determine overall health
            health_status["healthy"] = len(health_status["issues"]) == 0
            
            logger.info(f"Database health check: {'HEALTHY' if health_status['healthy'] else 'ISSUES FOUND'}")
            
            return health_status
            
        except Exception as e:
            logger.error(f"Database health check failed: {e}", exc_info=True)
            return {
                "healthy": False,
                "error": str(e),
                "issues": [f"Health check failed: {e}"],
                "recommendations": ["Check database connectivity", "Review database logs"]
            }
    
    def _check_migration_version(self, conn) -> Dict:
        """Check current migration version and consistency."""
        try:
            result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
            
            if result:
                version = result[0]
                return {
                    "migration_version": version,
                    "migration_table_exists": True
                }
            else:
                return {
                    "migration_version": None,
                    "migration_table_exists": True,
                    "issues": ["No migration version found in alembic_version table"],
                    "recommendations": ["Run database migrations: alembic upgrade head"]
                }
        except Exception as e:
            logger.error(f"Error checking migration version: {e}")
            return {
                "migration_version": None,
                "migration_table_exists": False,
                "issues": [f"Cannot read migration version: {e}"],
                "recommendations": ["Initialize database with: alembic upgrade head"]
            }
    
    def _check_enum_types(self, conn) -> Dict:
        """Verify all required enum types exist with correct values."""
        expected_enums = {
            'serviceconnectionstatus': ['connected', 'disconnected', 'error', 'pending'],
            'automationstatus': ['active', 'inactive', 'error'],
            'emailnotificationstatus': ['pending', 'sent', 'failed'],
            'backupstatus': ['pending', 'uploading', 'completed', 'failed']
        }
        
        try:
            # Query all enum types and their values using parameterized binding
            enum_names_list = list(expected_enums.keys())
            
            query = text("""
                SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
                FROM pg_type t
                JOIN pg_enum e ON t.oid = e.enumtypid
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public'
                AND t.typname = ANY(:enum_names)
                GROUP BY t.typname
            """)
            
            result = conn.execute(query, {"enum_names": enum_names_list})
            found_enums = {row[0]: row[1] for row in result}
            
            issues = []
            missing_enums = []
            invalid_enums = []
            
            for enum_name, expected_values in expected_enums.items():
                if enum_name not in found_enums:
                    missing_enums.append(enum_name)
                    issues.append(f"Missing enum type: {enum_name}")
                elif found_enums[enum_name] != expected_values:
                    invalid_enums.append(enum_name)
                    issues.append(
                        f"Enum '{enum_name}' has incorrect values: "
                        f"Expected {expected_values}, Got {found_enums[enum_name]}"
                    )
            
            enum_valid = len(missing_enums) == 0 and len(invalid_enums) == 0
            
            result_dict = {
                "enum_types_valid": enum_valid,
                "enums_found": len(found_enums),
                "enums_expected": len(expected_enums),
                "missing_enums": missing_enums,
                "invalid_enums": invalid_enums
            }
            
            if issues:
                result_dict["issues"] = issues
                result_dict["recommendations"] = ["Run database recovery script: ./scripts/nasa-grade-db-recovery.sh"]
            
            return result_dict
            
        except Exception as e:
            logger.error(f"Error checking enum types: {e}")
            return {
                "enum_types_valid": False,
                "error": str(e),
                "issues": [f"Cannot verify enum types: {e}"]
            }
    
    def _check_advisory_locks(self, conn) -> Dict:
        """Check for orphaned advisory locks."""
        try:
            result = conn.execute(text("""
                SELECT COUNT(*), array_agg(objid)
                FROM pg_locks
                WHERE locktype = 'advisory'
            """)).fetchone()
            
            lock_count = result[0] if result else 0
            lock_ids = result[1] if result and result[1] else []
            
            info = {
                "advisory_locks_count": lock_count,
                "advisory_lock_ids": lock_ids
            }
            
            if lock_count > 0:
                info["issues"] = [f"Found {lock_count} advisory locks - may indicate stuck migration"]
                info["recommendations"] = [
                    "Check if migrations are running: docker logs homelab-dashboard",
                    "If stuck, run recovery script: ./scripts/nasa-grade-db-recovery.sh"
                ]
            
            return info
            
        except Exception as e:
            logger.error(f"Error checking advisory locks: {e}")
            return {
                "advisory_locks_count": -1,
                "error": str(e)
            }
    
    def _check_table_consistency(self, conn, migration_version: Optional[str]) -> Dict:
        """Verify tables match expected migration state."""
        if not migration_version:
            return {"tables_consistent": False}
        
        # Define expected tables per migration version
        expected_tables_by_version = {
            '005': ['google_service_status', 'calendar_automations', 'email_notifications', 'drive_backups']
        }
        
        expected_tables = expected_tables_by_version.get(migration_version, [])
        
        if not expected_tables:
            return {"tables_consistent": True, "tables_checked": False}
        
        try:
            # Use parameterized binding for secure table name checking
            query = text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = ANY(:table_names)
            """)
            
            result = conn.execute(query, {"table_names": expected_tables})
            found_tables = [row[0] for row in result]
            
            missing_tables = [t for t in expected_tables if t not in found_tables]
            
            info = {
                "tables_present": len(found_tables),
                "tables_expected": len(expected_tables),
                "tables_consistent": len(missing_tables) == 0,
                "missing_tables": missing_tables
            }
            
            if missing_tables:
                info["issues"] = [f"Migration {migration_version} incomplete - missing tables: {', '.join(missing_tables)}"]
                info["recommendations"] = ["Run database recovery script: ./scripts/nasa-grade-db-recovery.sh"]
            
            return info
            
        except Exception as e:
            logger.error(f"Error checking table consistency: {e}")
            return {
                "tables_consistent": False,
                "error": str(e)
            }
    
    def trigger_recovery(self) -> Tuple[bool, str]:
        """
        Trigger automatic database recovery.
        
        This creates a task for Jarvis to execute the recovery script.
        Returns (success, message)
        """
        try:
            # Import here to avoid circular dependency
            from models.task import Task
            from database import db
            
            # Create recovery task
            task = Task(
                task_type='database_recovery',
                description='Automated database migration recovery',
                priority=10,  # Highest priority
                agent_type='orchestrator',
                status='pending',
                context={
                    'requires_approval': True,  # Recovery is destructive
                    'action': 'execute_script',
                    'script_path': './scripts/nasa-grade-db-recovery.sh',
                    'reason': 'Database health check detected migration inconsistency'
                }
            )
            
            db.session.add(task)
            db.session.commit()
            
            logger.info(f"Created database recovery task (ID: {task.id})")
            
            return True, f"Recovery task created (ID: {task.id}) - awaiting approval"
            
        except Exception as e:
            logger.error(f"Failed to create recovery task: {e}", exc_info=True)
            return False, f"Recovery task creation failed: {e}"


# Singleton instance
_monitor_instance = None

def get_database_health_monitor() -> DatabaseHealthMonitor:
    """Get singleton instance of database health monitor."""
    global _monitor_instance
    if _monitor_instance is None:
        _monitor_instance = DatabaseHealthMonitor()
    return _monitor_instance
