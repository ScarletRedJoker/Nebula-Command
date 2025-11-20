"""
Pre-Migration Schema Validator & Auto-Repair System
Detects and fixes schema drift before migrations run
"""
import logging
from typing import Dict, List, Tuple, Optional
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

class SchemaValidator:
    """Validates and repairs database schema issues"""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.engine: Optional[Engine] = None
        self.issues_found: List[str] = []
        self.repairs_made: List[str] = []
        
    def connect(self):
        """Establish database connection"""
        try:
            self.engine = create_engine(self.database_url)
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("✓ Database connection established")
            return True
        except Exception as e:
            logger.error(f"✗ Database connection failed: {e}")
            return False
    
    def check_table_schema(self, table_name: str, expected_columns: Dict[str, str]) -> Tuple[bool, List[str]]:
        """
        Check if table exists with correct column types.
        
        Args:
            table_name: Name of the table to check
            expected_columns: Dict of {column_name: expected_data_type}
            
        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []
        
        if not self.engine:
            return False, ["Database engine not initialized"]
        
        try:
            inspector = inspect(self.engine)
            
            if table_name not in inspector.get_table_names():
                logger.info(f"✓ Table '{table_name}' does not exist (will be created by migration)")
                return True, []
            
            # Table exists, check column types
            columns = inspector.get_columns(table_name)
            column_types = {col['name']: str(col['type']).lower() for col in columns}
            
            for col_name, expected_type in expected_columns.items():
                if col_name not in column_types:
                    continue  # Column will be added by migration
                
                actual_type = column_types[col_name]
                expected_type_lower = expected_type.lower()
                
                # Check for type mismatches
                if 'uuid' in expected_type_lower and 'uuid' not in actual_type:
                    issue = f"Column '{table_name}.{col_name}' is {actual_type} but should be UUID"
                    issues.append(issue)
                    logger.warning(f"✗ {issue}")
                    
                elif 'integer' in expected_type_lower and 'uuid' in actual_type:
                    issue = f"Column '{table_name}.{col_name}' is {actual_type} but should be INTEGER"
                    issues.append(issue)
                    logger.warning(f"✗ {issue}")
            
            if not issues:
                logger.info(f"✓ Table '{table_name}' schema is correct")
                return True, []
            else:
                return False, issues
                
        except Exception as e:
            logger.error(f"Error checking table '{table_name}': {e}")
            return False, [str(e)]
    
    def repair_table(self, table_name: str, backup: bool = True) -> bool:
        """
        Repair table by dropping and allowing migration to recreate.
        
        Args:
            table_name: Name of the table to repair
            backup: Whether to create a backup table first
            
        Returns:
            bool: True if repair succeeded
        """
        if not self.engine:
            logger.error("Database engine not initialized")
            return False
            
        try:
            with self.engine.begin() as conn:
                # Check if table has data
                result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                row_count = result.scalar()
                
                if row_count is not None and row_count > 0 and backup:
                    # Create backup
                    from datetime import datetime
                    backup_name = f"{table_name}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    conn.execute(text(f"CREATE TABLE {backup_name} AS SELECT * FROM {table_name}"))
                    logger.info(f"✓ Created backup: {backup_name} ({row_count} rows)")
                    self.repairs_made.append(f"Backed up {table_name} to {backup_name}")
                
                # Drop the table
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))
                logger.info(f"✓ Dropped table: {table_name}")
                self.repairs_made.append(f"Dropped {table_name}")
                
                return True
                
        except Exception as e:
            logger.error(f"✗ Failed to repair table '{table_name}': {e}")
            return False
    
    def validate_and_repair_agents_schema(self) -> bool:
        """
        Validate and repair agents/agent_messages/chat_history tables.
        This fixes the INTEGER vs UUID migration issue.
        
        Returns:
            bool: True if schema is valid or successfully repaired
        """
        logger.info("=" * 60)
        logger.info("DATABASE SCHEMA VALIDATION & AUTO-REPAIR")
        logger.info("=" * 60)
        
        if not self.connect():
            return False
        
        # Define expected schemas for critical tables
        agents_schema = {
            'id': 'UUID',
            'name': 'VARCHAR',
            'agent_type': 'VARCHAR'
        }
        
        agent_messages_schema = {
            'id': 'UUID',
            'from_agent_id': 'UUID',
            'to_agent_id': 'UUID'
        }
        
        chat_history_schema = {
            'id': 'UUID',
            'session_id': 'VARCHAR'
        }
        
        tables_to_check = [
            ('agents', agents_schema),
            ('agent_messages', agent_messages_schema),
            ('chat_history', chat_history_schema)
        ]
        
        needs_repair = []
        
        # Check all tables
        for table_name, expected_schema in tables_to_check:
            is_valid, issues = self.check_table_schema(table_name, expected_schema)
            if not is_valid:
                needs_repair.append(table_name)
                self.issues_found.extend(issues)
        
        # If issues found, repair automatically
        if needs_repair:
            logger.warning(f"⚠️  Schema issues detected in: {', '.join(needs_repair)}")
            logger.info("🔧 Initiating automatic repair...")
            
            # Repair tables in reverse dependency order
            repair_order = ['agent_messages', 'chat_history', 'agents']
            for table_name in repair_order:
                if table_name in needs_repair:
                    if not self.repair_table(table_name, backup=True):
                        logger.error(f"✗ Failed to repair {table_name}")
                        return False
            
            logger.info("✓ Schema repair completed successfully")
            logger.info("  Tables will be recreated by migrations with correct types")
            return True
        
        logger.info("✓ All tables have correct schema (or don't exist yet)")
        return True
    
    def get_report(self) -> dict:
        """Get validation and repair report"""
        return {
            'issues_found': self.issues_found,
            'repairs_made': self.repairs_made,
            'status': 'repaired' if self.repairs_made else 'valid'
        }
