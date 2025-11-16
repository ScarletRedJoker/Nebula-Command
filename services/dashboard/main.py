#!/usr/bin/env python3
"""
Main entry point - detects Replit vs Ubuntu and configures accordingly
"""
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import environment detection
from env_config.env import EnvironmentConfig as Config, IS_REPLIT
from app import app
import structlog

logger = structlog.get_logger('main')

if __name__ == '__main__':
    logger.info("🚀 Starting Homelab Dashboard")
    logger.info(f"📊 Configuration: {Config.summary()}")
    
    if IS_REPLIT:
        # Replit configuration
        logger.info("🌍 Running in REPLIT mode")
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=True
        )
    else:
        # Ubuntu production configuration
        logger.info("🌍 Running in UBUNTU mode")
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=False
        )
