"""
Unified Database URL Resolver
Handles multiple environment variable names for database connections
"""
import os
import logging

logger = logging.getLogger(__name__)

def get_database_url() -> str:
    """
    Resolve database URL from environment variables.
    
    Tries multiple common variable names in priority order:
    1. JARVIS_DATABASE_URL (preferred)
    2. DATABASE_URL (Replit standard)
    3. POSTGRES_URL (Ubuntu deployment)
    4. NEON_DATABASE_URL (Neon-specific)
    
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
    
    for var_name in url_vars:
        url = os.getenv(var_name)
        if url:
            logger.info(f"Database URL resolved from {var_name}")
            return url
    
    raise ValueError(
        f"No database URL found. Set one of: {', '.join(url_vars)}"
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
