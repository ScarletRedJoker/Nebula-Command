#!/bin/bash
celery -A celery_app.celery_app worker --loglevel=info --concurrency=4
