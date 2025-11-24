#!/usr/bin/env python3
"""
Database migration script to add missing columns to artifacts table.
Run this BEFORE restarting the dashboard if facts API is failing.
"""

import sys
import os
from sqlalchemy import text

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.db_service import db_service

def add_artifact_columns():
    """Add missing columns to artifacts table for facts storage"""
    
    print("=" * 60)
    print("Adding missing columns to artifacts table...")
    print("=" * 60)
    
    if not db_service.is_available:
        print("ERROR: Database is not available")
        return False
    
    try:
        with db_service.get_session() as session:
            # Check if columns already exist
            result = session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='artifacts' AND table_schema='public'
            """))
            existing_columns = {row[0] for row in result}
            
            print(f"Found {len(existing_columns)} existing columns in artifacts table")
            
            columns_to_add = []
            
            # Check and add artifact_type
            if 'artifact_type' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN artifact_type VARCHAR(50) DEFAULT 'file'"
                )
                print("  - Will add: artifact_type")
            
            # Check and add content
            if 'content' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN content TEXT"
                )
                print("  - Will add: content")
            
            # Check and add source
            if 'source' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN source VARCHAR(255)"
                )
                print("  - Will add: source")
            
            # Check and add tags
            if 'tags' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN tags JSONB"
                )
                print("  - Will add: tags")
            
            # Check and add data
            if 'data' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN data JSONB"
                )
                print("  - Will add: data")
            
            # Check and add created_at (might exist as uploaded_at)
            if 'created_at' not in existing_columns:
                columns_to_add.append(
                    "ALTER TABLE artifacts ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
                )
                print("  - Will add: created_at")
            
            if not columns_to_add:
                print("\n✓ All columns already exist! No migration needed.")
                return True
            
            print(f"\nExecuting {len(columns_to_add)} ALTER TABLE statements...")
            
            for sql in columns_to_add:
                print(f"  Executing: {sql[:60]}...")
                session.execute(text(sql))
            
            session.commit()
            print("\n✓ Successfully added missing columns!")
            print("✓ Facts API should now work correctly.")
            
            # Verify the changes
            result = session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='artifacts' AND table_schema='public'
                ORDER BY column_name
            """))
            
            all_columns = [row[0] for row in result]
            print(f"\nArtifacts table now has {len(all_columns)} columns:")
            for col in all_columns:
                print(f"  - {col}")
            
            return True
            
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = add_artifact_columns()
    sys.exit(0 if success else 1)
