# Replit Development Guide

## Overview
This guide explains how to develop and test the Homelab Dashboard on Replit before deploying to Ubuntu.

## Quick Start

1. **Open in Replit** - Project auto-detects Replit environment
2. **Click Run** - Dashboard starts in DEMO_MODE automatically
3. **Access Dashboard** - Opens at port 5000 with auto-login (evin/homelab)
4. **Edit Code** - Changes auto-reload
5. **Run Tests** - `cd services/dashboard && pytest`

## What Works on Replit

✅ **Dashboard Features:**
- Login page and authentication
- Control Center UI
- Smart Home Integration (mock data)
- Local AI Foundry (mock data)
- Container Marketplace (mock data)
- Agent-to-Agent Chat
- All API endpoints

✅ **Testing:**
- Unit tests (pytest)
- API endpoint tests
- Database migrations
- Frontend UI testing

❌ **What Doesn't Work:**
- Actual Docker container deployment
- Real Ollama AI models
- Real Home Assistant connection
- Redis/Celery background tasks

## Environment Variables

Replit automatically sets:
- `DEMO_MODE=true` - Uses mock services
- `DATABASE_URL` - Managed Postgres or SQLite fallback

## Environment Detection

The dashboard automatically detects when it's running on Replit vs Ubuntu:

```python
from config.env import Config, IS_REPLIT, IS_UBUNTU

# Check environment
if IS_REPLIT:
    print("Running on Replit!")
    print(f"Config: {Config.summary()}")
```

Configuration changes based on environment:
- **Replit**: SQLite, no Redis/Celery, console logging, demo mode enabled
- **Ubuntu**: PostgreSQL, Redis/Celery enabled, file logging, demo mode disabled

## Testing Commands

```bash
# Run all tests
cd services/dashboard && pytest

# Run specific tests
pytest tests/test_api_endpoints.py

# Run with coverage
pytest --cov=. --cov-report=html

# Run only unit tests (fast)
pytest -m unit

# Run verbose output
pytest -v
```

## Development Workflow

1. **Edit on Replit** - Make changes, see live updates
2. **Test locally** - Run pytest to verify
3. **Commit changes** - Git commit with clear message
4. **Push to GitHub** - Changes sync automatically
5. **Deploy on Ubuntu** - Pull and deploy on production server

## Limitations

- No Docker - Container marketplace shows mock data only
- No Redis - Background tasks disabled
- No Celery - Async jobs run synchronously
- SQLite default - Unless Replit Postgres configured

## Sync to Ubuntu

Changes made on Replit will work on Ubuntu because:
- Environment detection auto-switches to production mode
- Demo mode is disabled on Ubuntu by default
- Real services (Docker, Redis, Celery) activate on Ubuntu

## File Structure

```
services/dashboard/
├── config/
│   ├── __init__.py
│   └── env.py          # Environment detection
├── tests/
│   ├── __init__.py
│   ├── conftest.py     # Pytest fixtures
│   └── test_api_endpoints.py
├── app.py              # Main Flask app
├── main.py             # Entry point with env detection
└── pytest.ini          # Pytest configuration
```

## Troubleshooting

**Dashboard won't start:**
- Check logs in Console tool
- Verify DATABASE_URL is set
- Try: `rm jarvis_replit.db` to reset SQLite

**Tests failing:**
- Ensure in `services/dashboard` directory
- Run `pip install -r requirements-replit.txt`
- Check pytest output for specific errors

**Database issues:**
- Replit Postgres: Use built-in database tool
- SQLite fallback: File at `services/dashboard/jarvis_replit.db`

**Import errors:**
- Make sure you're in the correct directory
- Check that all dependencies are installed
- Run: `pip install -r requirements.txt`

## Best Practices

1. **Always test before committing** - Run pytest to catch issues early
2. **Use demo mode for testing** - Avoids needing real services
3. **Check environment** - Be aware whether you're on Replit or Ubuntu
4. **Review logs** - Check console output for errors
5. **Use fixtures** - Leverage pytest fixtures for cleaner tests

## Additional Resources

- [Flask Testing Documentation](https://flask.palletsprojects.com/en/2.3.x/testing/)
- [Pytest Documentation](https://docs.pytest.org/)
- [Replit Documentation](https://docs.replit.com/)
