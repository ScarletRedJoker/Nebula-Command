import logging
from datetime import datetime
from collections import deque
from threading import Lock

logger = logging.getLogger(__name__)

class ActivityService:
    def __init__(self, max_activities=100):
        self.max_activities = max_activities
        self.activities = deque(maxlen=max_activities)
        self.lock = Lock()
    
    def log_activity(self, activity_type, message, icon='info-circle', level='info'):
        with self.lock:
            activity = {
                'timestamp': datetime.now().isoformat(),
                'type': activity_type,
                'message': message,
                'icon': icon,
                'level': level,
                'time_ago': 'just now'
            }
            self.activities.appendleft(activity)
            logger.info(f"Activity logged: {activity_type} - {message}")
    
    def get_recent_activities(self, limit=20):
        with self.lock:
            activities_list = list(self.activities)[:limit]
            
            for activity in activities_list:
                try:
                    activity_time = datetime.fromisoformat(activity['timestamp'])
                    time_diff = datetime.now() - activity_time
                    
                    seconds = time_diff.total_seconds()
                    if seconds < 60:
                        activity['time_ago'] = 'just now'
                    elif seconds < 3600:
                        mins = int(seconds / 60)
                        activity['time_ago'] = f'{mins}m ago'
                    elif seconds < 86400:
                        hours = int(seconds / 3600)
                        activity['time_ago'] = f'{hours}h ago'
                    else:
                        days = int(seconds / 86400)
                        activity['time_ago'] = f'{days}d ago'
                except:
                    activity['time_ago'] = 'unknown'
            
            return activities_list
    
    def clear_activities(self):
        with self.lock:
            self.activities.clear()
            logger.info("Activity log cleared")

activity_service = ActivityService()
