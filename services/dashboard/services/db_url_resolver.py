"""
Unified Database URL Resolver
Handles multiple environment variable names for database connections
Automatically builds connection URLs from component parts
"""
import os
import logging
import re

logger = logging.getLogger(__name__)

def get_database_url() -> str:
    """
    Resolve database URL from environment variables.
    
    Strategy:
    1. Try pre-built URLs (JARVIS_DATABASE_URL, DATABASE_URL, etc.)
    2. Auto-build from components if password placeholders detected
    3. Build from scratch using JARVIS_DB_PASSWORD if available
    
    Returns:
        str: Database connection URL
        
    Raises:
        ValueError: If no database URL is found
    """
    url_vars = [
        'JARVIS_DATABASE_URL',
        'DATABASE_URL',
        'POSTGRES_URL',
        'NEON_DATABASE_URL'
    ]
    
    # Try each URL variable
    for var_name in url_vars:
        url = os.getenv(var_name)
        if url:
            # Check if URL contains placeholder text instead of actual password
            if 'JARVIS_DB_PASSWORD' in url or 'YOUR_' in url or 'PASSWORD_HERE' in url:
                logger.warning(f"{var_name} contains placeholder text, attempting to auto-fix...")
                
                # Try to build correct URL from component password
                actual_password = os.getenv('JARVIS_DB_PASSWORD')
                if actual_password and 'YOUR_' not in actual_password:
                    # Replace placeholder with actual password
                    fixed_url = url.replace('JARVIS_DB_PASSWORD', actual_password)
                    logger.info(f"✓ Auto-fixed database URL using JARVIS_DB_PASSWORD")
                    return fixed_url
                else:
                    logger.warning(f"Cannot auto-fix: JARVIS_DB_PASSWORD not set or is placeholder")
                    continue
            else:
                logger.info(f"Database URL resolved from {var_name}")
                return url
    
    # If no pre-built URL found, try to build from components
    jarvis_password = os.getenv('JARVIS_DB_PASSWORD')
    postgres_host = os.getenv('POSTGRES_HOST', 'homelab-postgres')
    postgres_port = os.getenv('POSTGRES_PORT', '5432')
    
    if jarvis_password and 'YOUR_' not in jarvis_password:
        built_url = f"postgresql://jarvis:{jarvis_password}@{postgres_host}:{postgres_port}/homelab_jarvis"
        logger.info(f"✓ Built database URL from JARVIS_DB_PASSWORD")
        return built_url
    
    raise ValueError(
        f"No valid database URL found. Either:\n"
        f"  1. Set JARVIS_DATABASE_URL with actual password, OR\n"
        f"  2. Set JARVIS_DB_PASSWORD (it will auto-build the URL)"
    )

def get_database_components() -> dict:
    """
    Parse database URL into components.
    
    Returns:
        dict: Database connection components (host, port, user, password, database)
    """
    import re
    
    url = get_database_url()
    
    # Parse postgresql://user:password@host:port/database
    pattern = r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)'
    match = re.match(pattern, url)
    
    if not match:
        raise ValueError(f"Invalid database URL format: {url}")
    
    user, password, host, port, database = match.groups()
    
    return {
        'user': user,
        'password': password,
        'host': host,
        'port': int(port),
        'database': database,
        'url': url
    }
