#!/usr/bin/env python3
"""Healthcheck script for storage monitor"""
import sys
import requests

try:
    response = requests.get('http://localhost:9634/health', timeout=5)
    if response.status_code == 200:
        sys.exit(0)
    sys.exit(1)
except:
    sys.exit(1)
