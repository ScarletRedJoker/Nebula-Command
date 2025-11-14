from celery import Celery
from config import Config
import logging

logger = logging.getLogger(__name__)

celery_app = Celery(
    'jarvis_workflow_engine',
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
    include=['workers.workflow_worker', 'workers.analysis_worker', 'workers.google_tasks']
)

celery_app.conf.update(
    task_serializer=Config.CELERY_TASK_SERIALIZER,
    result_serializer=Config.CELERY_RESULT_SERIALIZER,
    accept_content=Config.CELERY_ACCEPT_CONTENT,
    timezone=Config.CELERY_TIMEZONE,
    enable_utc=Config.CELERY_ENABLE_UTC,
    task_track_started=Config.CELERY_TASK_TRACK_STARTED,
    task_time_limit=Config.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=Config.CELERY_TASK_SOFT_TIME_LIMIT,
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_routes={
        'workers.workflow_worker.run_deployment_workflow': {'queue': 'deployments'},
        'workers.workflow_worker.run_dns_update_workflow': {'queue': 'dns'},
        'workers.workflow_worker.run_artifact_analysis_workflow': {'queue': 'analysis'},
        'workers.analysis_worker.analyze_artifact_task': {'queue': 'analysis'},
        'workers.analysis_worker.analyze_preview_task': {'queue': 'analysis'},
        'workers.google_tasks.poll_calendar_events': {'queue': 'google'},
        'workers.google_tasks.send_email_task': {'queue': 'google'},
        'workers.google_tasks.backup_to_drive_task': {'queue': 'google'},
        'workers.google_tasks.cleanup_old_backups': {'queue': 'google'},
    },
    task_default_queue='default',
    task_default_exchange='tasks',
    task_default_routing_key='task.default',
)

logger.info("Celery app initialized with broker: %s", Config.CELERY_BROKER_URL)

__all__ = ['celery_app']
