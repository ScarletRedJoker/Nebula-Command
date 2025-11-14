# Google Services Integration Setup Guide

This guide covers how to set up and use the Google Calendar, Gmail, and Google Drive integrations in the Jarvis homelab dashboard.

## Overview

The Google Services integration provides:
- **Google Calendar**: Automate Home Assistant actions based on calendar events
- **Gmail**: Send email notifications for system alerts, deployments, and errors
- **Google Drive**: Backup system files, configs, and database dumps

## Prerequisites

- Replit account with access to connectors
- Google account for Calendar, Gmail, and Drive access
- Running Jarvis dashboard instance
- Redis for token caching
- PostgreSQL database for tracking automations and backups

## Environment Variables

The following environment variables are required:

```bash
# Replit Connector Configuration
REPLIT_CONNECTORS_HOSTNAME=<your-replit-connectors-hostname>
REPL_IDENTITY=<your-repl-identity>  # OR WEB_REPL_RENEWAL

# Redis Configuration (for token caching)
REDIS_URL=redis://localhost:6379/0

# Optional: Default email recipient
DEFAULT_EMAIL_RECIPIENT=your-email@example.com
```

## Setup Instructions

### 1. Connect Google Services

Navigate to the Google Services page in your dashboard:

1. Click on "Google Services" in the sidebar navigation
2. Go to the "Status" tab
3. For each service (Calendar, Gmail, Drive):
   - Click "Connect [Service]"
   - Follow the OAuth flow to authorize access
   - Grant the requested permissions

The integration uses Replit connectors to manage authentication automatically.

### 2. Configure Calendar Automations

Calendar automations allow you to trigger Home Assistant actions based on calendar events.

**Example: Turn on lights before meetings**

1. Go to the "Calendar Automations" tab
2. Click "New Automation"
3. Fill in the form:
   - **Name**: "Meeting Prep"
   - **Description**: "Turn on office lights 5 minutes before meetings"
   - **Event Keywords**: "meeting, standup, call" (comma-separated)
   - **Lead Time**: 5 (minutes before event)
   - **Lag Time**: 0 (minutes after event)
   - **HA Service Domain**: "light"
   - **HA Service Name**: "turn_on"
4. Click "Save Automation"

The system will poll your calendar every 5 minutes and trigger the automation when matching events are found.

**Example: Turn off lights after events**

- **Name**: "Meeting Cleanup"
- **Keywords**: "meeting"
- **Lead Time**: 0
- **Lag Time**: 5 (minutes after event ends)
- **HA Domain**: "light"
- **HA Service**: "turn_off"

### 3. Configure Email Notifications

Email notifications can be sent for various system events.

**Send a Test Email**

1. Go to the "Email Notifications" tab
2. Fill in the test email form:
   - **To**: recipient@example.com
   - **Subject**: "Test from Jarvis Dashboard"
   - **Message**: Your message content
   - **Template**: Choose from:
     - Custom: Plain email
     - Deployment: For deployment notifications
     - Error: For error alerts
     - Backup: For backup notifications
     - SSL Expiry: For SSL certificate warnings
3. Click "Send Email"

**Programmatic Email Sending**

Use the Celery tasks to send emails from your code:

```python
from workers.google_tasks import send_email_task

# Send deployment notification
send_email_task.delay(
    to='admin@example.com',
    subject='Deployment Complete: MyApp v1.0',
    body='Application deployed successfully',
    template_type='deployment',
    service_name='MyApp',
    status='success',
    deployment_url='https://myapp.example.com'
)

# Send error notification
send_email_task.delay(
    to='admin@example.com',
    subject='Error in Production',
    body='Database connection failed',
    template_type='error',
    error_type='DatabaseError',
    error_message='Connection timeout'
)
```

### 4. Configure Drive Backups

Backup your system files, configurations, and database dumps to Google Drive.

**Manual Backup**

1. Go to the "Backups" tab
2. Click "Trigger Backup"
3. Select files to backup
4. Add description (optional)
5. Set retention period (default: 30 days)

**Programmatic Backups**

Use the Celery task to automate backups:

```python
from workers.google_tasks import backup_to_drive_task

# Backup configuration files
backup_to_drive_task.delay(
    file_paths=[
        '/path/to/config.yaml',
        '/path/to/database.db',
        '/path/to/logs/app.log'
    ],
    description='Daily system backup',
    backup_type='automated',
    retention_days=30
)
```

**Scheduled Backups**

The system automatically cleans up backups older than 30 days. You can configure additional scheduled backups using Celery Beat:

```python
# In celery_app.py, add:
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    'daily-backup': {
        'task': 'workers.google_tasks.backup_to_drive_task',
        'schedule': crontab(hour=2, minute=0),  # 2 AM daily
        'args': (
            ['/path/to/config.yaml', '/path/to/database.db'],
            'Daily automated backup',
            'system',
            'automated',
            30
        )
    }
}
```

## API Endpoints

### Status

- `GET /google/api/status` - Get connection status of all services

### Calendar

- `GET /google/api/calendar/automations` - List all automations
- `POST /google/api/calendar/automations` - Create new automation
- `DELETE /google/api/calendar/automations/<id>` - Delete automation

### Gmail

- `POST /google/api/gmail/send` - Send email
- `GET /google/api/gmail/notifications` - List sent notifications

### Drive

- `POST /google/api/drive/backup` - Trigger backup
- `GET /google/api/drive/backups/history` - List backup history
- `GET /google/api/drive/storage` - Get storage info
- `DELETE /google/api/drive/backups/<id>` - Delete backup

All API endpoints require CSRF tokens and are rate-limited.

## Celery Background Tasks

The integration includes several background tasks:

### poll_calendar_events
**Schedule**: Every 5 minutes  
**Purpose**: Check calendar for events that match automation criteria and trigger Home Assistant services

### send_email_task
**Trigger**: On-demand  
**Purpose**: Send email via Gmail asynchronously

### backup_to_drive_task
**Trigger**: On-demand or scheduled  
**Purpose**: Upload files to Google Drive

### cleanup_old_backups
**Schedule**: Daily  
**Purpose**: Remove backups older than retention period

## Monitoring and Troubleshooting

### Check Service Status

1. Navigate to Google Services > Status tab
2. View connection status for each service
3. Check for error messages

### Common Issues

**Authentication Errors**

- Verify `REPLIT_CONNECTORS_HOSTNAME` is set correctly
- Check that Google services are authorized in Replit
- Try disconnecting and reconnecting the service

**Calendar Automations Not Triggering**

- Verify calendar events contain the configured keywords
- Check lead/lag time settings are appropriate
- Ensure Home Assistant service domain and name are correct
- Check Celery worker logs for errors

**Email Not Sending**

- Verify Gmail service is connected
- Check recipient email address is valid
- Review email notification logs for errors
- Ensure Gmail API quotas are not exceeded

**Backup Failures**

- Verify Google Drive service is connected
- Check file paths exist and are readable
- Review Drive backup logs for errors
- Ensure sufficient Drive storage space

### View Logs

Check Celery worker logs for detailed error information:

```bash
# View logs for Google tasks
celery -A celery_app worker --loglevel=info -Q google
```

### Database Queries

Inspect the database directly:

```python
from models.google_integration import CalendarAutomation, EmailNotification, DriveBackup
from services.db_service import db_service

# List all automations
with db_service.get_session() as session:
    automations = session.query(CalendarAutomation).all()
    for auto in automations:
        print(f"{auto.name}: {auto.status}")

# List recent email notifications
with db_service.get_session() as session:
    notifications = session.query(EmailNotification).order_by(
        EmailNotification.created_at.desc()
    ).limit(10).all()
    for notif in notifications:
        print(f"{notif.recipient}: {notif.subject} - {notif.status}")
```

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **CSRF Protection**: All POST endpoints require valid CSRF tokens
3. **Rate Limiting**: API endpoints are rate-limited to prevent abuse
4. **Authentication**: All endpoints require user authentication
5. **Token Storage**: OAuth tokens are cached in Redis with short TTL

## Best Practices

1. **Test Automations**: Start with lead times of 5-10 minutes to test
2. **Email Templates**: Use appropriate templates for different notification types
3. **Backup Retention**: Set retention periods based on storage needs
4. **Monitoring**: Regularly check status dashboard for errors
5. **Keyword Matching**: Use specific keywords to avoid false triggers

## Advanced Configuration

### Custom Email Templates

Create custom email templates by modifying `gmail_service.py`:

```python
def send_custom_notification(self, to: str, template_vars: dict):
    subject = f"Custom Alert: {template_vars['title']}"
    body = f"""
    <html>
        <body>
            <h2>{template_vars['title']}</h2>
            <p>{template_vars['message']}</p>
            <p><strong>Status:</strong> {template_vars['status']}</p>
        </body>
    </html>
    """
    return self.send_email(to, subject, body, html=True)
```

### Calendar Event Filtering

Add custom filtering logic in `calendar_service.py`:

```python
def get_work_events_only(self):
    """Get only work-related calendar events"""
    events = self.list_events(time_min=datetime.utcnow())
    return [e for e in events if 'work' in e.get('summary', '').lower()]
```

### Drive Folder Organization

Customize backup folder structure in `drive_service.py`:

```python
def _get_or_create_backup_folder(self, folder_name: str):
    """Create organized backup folders by date or type"""
    parent_folder = self._backup_folder_id
    folder_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_folder]
    }
    # Implementation...
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the Celery worker logs
3. Check the database for error messages
4. Verify environment variables are set correctly

## Future Enhancements

Potential future features:
- Google Sheets integration for logging and analytics
- Google Photos backup integration
- Calendar event creation from automations
- Advanced email templates with attachments
- Incremental backups for large files
- Multi-calendar support
- Gmail filtering and labeling
- Drive file sharing and permissions management
