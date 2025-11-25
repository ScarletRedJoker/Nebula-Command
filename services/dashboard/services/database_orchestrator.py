"""
Database Orchestration Service
Production-grade database management with migration tracking, health checks, and proper startup sequencing.
Eliminates timing issues where services query tables before migrations complete.
"""

import os
import time
import logging
import threading
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)


class DatabaseOrchestrator:
    """
    Centralized database orchestration with:
    - Migration status tracking
    - Schema readiness verification
    - Connection pooling with health monitoring
    - Retry logic with exponential backoff
    - Migration locking to prevent concurrent migrations
    """

    REQUIRED_TABLES = [
        'marketplace_apps',
        'deployments', 
        'conversation_messages',
        'conversation_history',
        'activity_logs',
        'storage_stats',
        'backup_jobs',
        'agents',
    ]

    def __init__(self):
        self._engine = None
        self._session_factory = None
        self._initialized = False
        self._schema_ready = False
        self._lock = threading.Lock()
        self._migration_lock = threading.Lock()
        self._last_health_check = None
        self._health_check_interval = 30
        self._connection_retries = 5
        self._retry_delay = 2
        
    @property
    def database_url(self) -> Optional[str]:
        return os.environ.get('JARVIS_DATABASE_URL') or os.environ.get('DATABASE_URL')

    def initialize(self, max_retries: int = 10, retry_delay: float = 3.0) -> bool:
        """
        Initialize database connection with retry logic.
        Returns True if successful, False otherwise.
        """
        if self._initialized:
            return True

        with self._lock:
            if self._initialized:
                return True

            db_url = self.database_url
            if not db_url:
                logger.error("❌ No database URL configured (JARVIS_DATABASE_URL or DATABASE_URL)")
                return False

            for attempt in range(1, max_retries + 1):
                try:
                    logger.info(f"[DB Orchestrator] Connection attempt {attempt}/{max_retries}...")
                    
                    self._engine = create_engine(
                        db_url,
                        pool_size=10,
                        max_overflow=20,
                        pool_timeout=30,
                        pool_recycle=1800,
                        pool_pre_ping=True,
                        echo=False
                    )
                    
                    with self._engine.connect() as conn:
                        result = conn.execute(text("SELECT 1"))
                        result.fetchone()
                    
                    self._session_factory = sessionmaker(bind=self._engine)
                    self._initialized = True
                    logger.info("✅ Database connection established")
                    return True

                except OperationalError as e:
                    logger.warning(f"[DB Orchestrator] Connection failed (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        sleep_time = retry_delay * (2 ** (attempt - 1))
                        logger.info(f"[DB Orchestrator] Retrying in {sleep_time:.1f}s...")
                        time.sleep(sleep_time)
                    else:
                        logger.error(f"❌ Failed to connect after {max_retries} attempts")
                        return False

            return False

    def wait_for_schema(self, timeout: int = 120, poll_interval: float = 2.0) -> bool:
        """
        Wait for database schema to be fully migrated.
        Checks for presence of required tables before returning.
        """
        if not self._initialized:
            if not self.initialize():
                return False

        logger.info(f"[DB Orchestrator] Waiting for schema (timeout: {timeout}s)...")
        start_time = time.time()
        
        while (time.time() - start_time) < timeout:
            try:
                missing_tables = self.check_schema_status()
                
                if not missing_tables:
                    self._schema_ready = True
                    logger.info("✅ Schema is fully ready - all required tables exist")
                    return True

                elapsed = int(time.time() - start_time)
                logger.info(f"[DB Orchestrator] Waiting for tables ({elapsed}s): {missing_tables[:3]}{'...' if len(missing_tables) > 3 else ''}")
                time.sleep(poll_interval)

            except Exception as e:
                logger.warning(f"[DB Orchestrator] Schema check error: {e}")
                time.sleep(poll_interval)

        logger.error(f"❌ Schema not ready after {timeout}s timeout")
        return False

    def check_schema_status(self) -> List[str]:
        """
        Check which required tables are missing.
        Returns list of missing table names (empty if all exist).
        """
        if not self._initialized or self._engine is None:
            raise RuntimeError("Database not initialized")

        try:
            inspector = inspect(self._engine)
            existing_tables = set(inspector.get_table_names())
            missing = [t for t in self.REQUIRED_TABLES if t not in existing_tables]
            return missing
        except Exception as e:
            logger.error(f"Error checking schema: {e}")
            raise

    def run_migrations(self, force: bool = True) -> bool:
        """
        Run Alembic migrations with proper locking.
        """
        with self._migration_lock:
            logger.info("[DB Orchestrator] Running database migrations...")
            
            try:
                import subprocess
                env = os.environ.copy()
                
                cmd = ['alembic', 'upgrade', 'head']
                result = subprocess.run(
                    cmd,
                    cwd=os.path.dirname(os.path.dirname(__file__)),
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode == 0:
                    logger.info("✅ Migrations completed successfully")
                    return True
                else:
                    logger.error(f"❌ Migration failed: {result.stderr}")
                    return False

            except subprocess.TimeoutExpired:
                logger.error("❌ Migration timed out after 120s")
                return False
            except Exception as e:
                logger.error(f"❌ Migration error: {e}")
                return False

    @contextmanager
    def get_session(self):
        """Get a database session with automatic cleanup."""
        if not self._initialized or self._session_factory is None:
            raise RuntimeError("Database not initialized - call initialize() first")

        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def health_check(self) -> Dict[str, Any]:
        """
        Comprehensive database health check.
        Returns detailed status for monitoring.
        """
        status = {
            'connected': False,
            'schema_ready': self._schema_ready,
            'missing_tables': [],
            'pool_size': None,
            'pool_checked_out': None,
            'timestamp': datetime.utcnow().isoformat(),
            'error': None
        }

        try:
            if not self._initialized or self._engine is None:
                status['error'] = 'Not initialized'
                return status

            with self._engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                status['connected'] = True

            status['missing_tables'] = self.check_schema_status()
            status['schema_ready'] = len(status['missing_tables']) == 0

            pool = self._engine.pool
            if pool is not None:
                status['pool_size'] = getattr(pool, 'size', lambda: None)()
                status['pool_checked_out'] = getattr(pool, 'checkedout', lambda: None)()

        except Exception as e:
            status['error'] = str(e)

        return status

    def ensure_ready(self, timeout: int = 60) -> bool:
        """
        Convenience method to ensure database is fully ready for use.
        Initializes connection and waits for schema in one call.
        """
        if not self.initialize():
            return False
        return self.wait_for_schema(timeout=timeout)

    def graceful_query(self, query_func, default=None, log_errors: bool = True):
        """
        Execute a query with graceful degradation.
        Returns default value if database isn't ready instead of crashing.
        """
        if not self._initialized or not self._schema_ready:
            if log_errors:
                logger.debug("[DB Orchestrator] Query skipped - database not ready")
            return default

        try:
            return query_func()
        except (OperationalError, ProgrammingError) as e:
            if log_errors:
                logger.warning(f"[DB Orchestrator] Query failed gracefully: {e}")
            return default


db_orchestrator = DatabaseOrchestrator()
