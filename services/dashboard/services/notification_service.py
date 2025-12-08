"""
Notification Service for multi-channel alerts
Supports Discord webhooks, Email (Gmail), and generic webhooks
"""

import logging
import os
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Multi-channel notification service for system alerts
    
    Supported channels:
    - discord: Send to Discord via webhook
    - email: Send via Gmail service
    - webhook: Send to generic webhook endpoint
    """
    
    def __init__(self):
        """Initialize notification service with environment configuration"""
        self.discord_webhook_url = os.environ.get('DISCORD_WEBHOOK_URL')
        self.notification_email = os.environ.get('NOTIFICATION_EMAIL')
        self.generic_webhook_url = os.environ.get('GENERIC_WEBHOOK_URL')
        
        # Lazy-load Gmail service to avoid circular imports
        self._gmail_service = None
        
        # Log configuration status
        self._log_config_status()
    
    def _log_config_status(self):
        """Log which notification channels are configured"""
        channels = []
        if self.discord_webhook_url:
            channels.append('Discord')
        if self.notification_email:
            channels.append('Email')
        if self.generic_webhook_url:
            channels.append('Generic Webhook')
        
        if channels:
            logger.info(f"Notification service initialized with channels: {', '.join(channels)}")
        else:
            logger.warning("No notification channels configured. Set DISCORD_WEBHOOK_URL, NOTIFICATION_EMAIL, or GENERIC_WEBHOOK_URL")
    
    @property
    def gmail_service(self):
        """Lazy-load Gmail service to avoid circular imports"""
        if self._gmail_service is None:
            try:
                from services.google.gmail_service import gmail_service
                self._gmail_service = gmail_service
                logger.debug("Gmail service loaded successfully")
            except ImportError as e:
                logger.warning(f"Failed to load Gmail service: {e}")
                self._gmail_service = None
        return self._gmail_service
    
    def send_storage_alert(
        self,
        alert_data: Dict[str, Any],
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send storage alert notification via configured channels
        
        Args:
            alert_data: Alert information containing:
                - metric_type: Type of storage metric
                - metric_name: Name of the metric
                - mount_point: Mount point path (optional)
                - current_percent: Current usage percentage
                - threshold_percent: Threshold that was exceeded
                - size_bytes: Current size in bytes (optional)
                - timestamp: Alert timestamp
            channels: List of channels to send to (discord, email, webhook)
                     If None, sends to all configured channels
        
        Returns:
            Dict with notification results per channel
        """
        logger.info(f"Sending storage alert for {alert_data.get('metric_name')}")
        
        # Use all configured channels if none specified
        if channels is None:
            channels = self._get_available_channels()
        
        if not channels:
            logger.warning("No notification channels available or specified")
            return {'success': False, 'error': 'No channels configured'}
        
        # Prepare alert message
        metric_name = alert_data.get('metric_name', 'Unknown')
        metric_type = alert_data.get('metric_type', 'storage')
        current_pct = alert_data.get('current_percent', 0)
        threshold_pct = alert_data.get('threshold_percent', 0)
        mount_point = alert_data.get('mount_point', 'N/A')
        timestamp = alert_data.get('timestamp', datetime.utcnow().isoformat())
        
        results = {}
        
        # Send to Discord
        if 'discord' in channels:
            results['discord'] = self._send_discord_storage_alert(
                metric_name, metric_type, current_pct, threshold_pct, mount_point, timestamp
            )
        
        # Send via Email
        if 'email' in channels:
            results['email'] = self._send_email_storage_alert(
                metric_name, metric_type, current_pct, threshold_pct, mount_point, timestamp, alert_data
            )
        
        # Send to generic webhook
        if 'webhook' in channels:
            results['webhook'] = self._send_webhook_storage_alert(alert_data)
        
        # Determine overall success
        success = any(r.get('success', False) for r in results.values())
        
        logger.info(f"Storage alert notification sent: {success}, results: {results}")
        
        return {
            'success': success,
            'results': results,
            'channels': channels
        }
    
    def send_token_expiry_alert(
        self,
        platform: str,
        user_email: str,
        channels: Optional[List[str]] = None,
        expires_in_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Send token expiry notification
        
        Args:
            platform: Platform name (e.g., 'Google Calendar', 'Gmail', 'Spotify')
            user_email: Email of the user whose token is expiring
            channels: List of channels to send to (discord, email, webhook)
            expires_in_days: Number of days until expiry (optional)
        
        Returns:
            Dict with notification results per channel
        """
        logger.info(f"Sending token expiry alert for {platform} - {user_email}")
        
        # Use all configured channels if none specified
        if channels is None:
            channels = self._get_available_channels()
        
        if not channels:
            logger.warning("No notification channels available or specified")
            return {'success': False, 'error': 'No channels configured'}
        
        results = {}
        
        # Send to Discord
        if 'discord' in channels:
            results['discord'] = self._send_discord_token_expiry(
                platform, user_email, expires_in_days
            )
        
        # Send via Email
        if 'email' in channels:
            results['email'] = self._send_email_token_expiry(
                platform, user_email, expires_in_days
            )
        
        # Send to generic webhook
        if 'webhook' in channels:
            results['webhook'] = self._send_webhook_token_expiry(
                platform, user_email, expires_in_days
            )
        
        # Determine overall success
        success = any(r.get('success', False) for r in results.values())
        
        logger.info(f"Token expiry notification sent: {success}, results: {results}")
        
        return {
            'success': success,
            'results': results,
            'channels': channels
        }
    
    def _get_available_channels(self) -> List[str]:
        """Get list of configured notification channels"""
        channels = []
        if self.discord_webhook_url:
            channels.append('discord')
        if self.notification_email:
            channels.append('email')
        if self.generic_webhook_url:
            channels.append('webhook')
        return channels
    
    def _send_discord_storage_alert(
        self,
        metric_name: str,
        metric_type: str,
        current_pct: float,
        threshold_pct: float,
        mount_point: str,
        timestamp: str
    ) -> Dict[str, Any]:
        """Send storage alert to Discord webhook"""
        if not self.discord_webhook_url:
            logger.warning("Discord webhook URL not configured")
            return {'success': False, 'error': 'Discord webhook not configured'}
        
        try:
            # Determine severity color
            if current_pct >= 95:
                color = 0xFF0000  # Red - Critical
            elif current_pct >= 85:
                color = 0xFF8C00  # Orange - Warning
            else:
                color = 0xFFD700  # Yellow - Notice
            
            # Create Discord embed
            embed = {
                'title': '⚠️ Storage Alert',
                'description': f'Storage threshold exceeded for **{metric_name}**',
                'color': color,
                'fields': [
                    {
                        'name': '📊 Current Usage',
                        'value': f'{current_pct:.1f}%',
                        'inline': True
                    },
                    {
                        'name': '🎯 Threshold',
                        'value': f'{threshold_pct:.1f}%',
                        'inline': True
                    },
                    {
                        'name': '💾 Type',
                        'value': metric_type,
                        'inline': True
                    },
                    {
                        'name': '📁 Mount Point',
                        'value': mount_point,
                        'inline': False
                    }
                ],
                'footer': {
                    'text': 'Homelab Storage Monitor'
                },
                'timestamp': timestamp
            }
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Discord storage alert sent successfully for {metric_name}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord storage alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending Discord storage alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_email_storage_alert(
        self,
        metric_name: str,
        metric_type: str,
        current_pct: float,
        threshold_pct: float,
        mount_point: str,
        timestamp: str,
        alert_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send storage alert via email"""
        if not self.notification_email:
            logger.warning("Notification email not configured")
            return {'success': False, 'error': 'Notification email not configured'}
        
        if not self.gmail_service:
            logger.warning("Gmail service not available")
            return {'success': False, 'error': 'Gmail service not available'}
        
        try:
            # Determine severity emoji
            if current_pct >= 95:
                emoji = '🔴'
                severity = 'CRITICAL'
            elif current_pct >= 85:
                emoji = '🟠'
                severity = 'WARNING'
            else:
                emoji = '🟡'
                severity = 'NOTICE'
            
            # Format size if available
            size_info = ''
            if 'size_bytes' in alert_data:
                size_gb = alert_data['size_bytes'] / (1024**3)
                size_info = f'<p><strong>Current Size:</strong> {size_gb:.2f} GB</p>'
            
            # Create email body
            body = f"""
<div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">{emoji} Storage Alert - {severity}</h2>
    
    <div style="background-color: #ffffff; padding: 20px; border-radius: 6px; border-left: 4px solid #ef4444;">
        <p><strong>Storage Name:</strong> {metric_name}</p>
        <p><strong>Type:</strong> {metric_type}</p>
        <p><strong>Mount Point:</strong> {mount_point}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 15px 0;">
        <p><strong>Current Usage:</strong> <span style="color: #dc2626; font-size: 18px; font-weight: bold;">{current_pct:.1f}%</span></p>
        <p><strong>Alert Threshold:</strong> {threshold_pct:.1f}%</p>
        {size_info}
        <p><strong>Timestamp:</strong> {timestamp}</p>
    </div>
    
    <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
        <strong>Recommended Actions:</strong><br>
        • Review and clean up unnecessary files<br>
        • Archive old data to long-term storage<br>
        • Consider expanding storage capacity<br>
        • Check for large log files or temporary data
    </p>
</div>
"""
            
            result = self.gmail_service.send_email(
                to=self.notification_email,
                subject=f'{emoji} Storage Alert: {metric_name} at {current_pct:.1f}%',
                body=body,
                template_type='error',
                html=True,
                error_type='Storage Alert'
            )
            
            logger.info(f"Email storage alert sent successfully to {self.notification_email}")
            return {'success': True, 'message_id': result.get('id')}
        
        except Exception as e:
            logger.error(f"Failed to send email storage alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_webhook_storage_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send storage alert to generic webhook"""
        if not self.generic_webhook_url:
            logger.warning("Generic webhook URL not configured")
            return {'success': False, 'error': 'Generic webhook not configured'}
        
        try:
            payload = {
                'type': 'storage_alert',
                'data': alert_data,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            response = requests.post(
                self.generic_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Generic webhook storage alert sent successfully")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send generic webhook storage alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending generic webhook storage alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_discord_token_expiry(
        self,
        platform: str,
        user_email: str,
        expires_in_days: Optional[int]
    ) -> Dict[str, Any]:
        """Send token expiry alert to Discord"""
        if not self.discord_webhook_url:
            logger.warning("Discord webhook URL not configured")
            return {'success': False, 'error': 'Discord webhook not configured'}
        
        try:
            # Determine urgency
            if expires_in_days is not None:
                if expires_in_days <= 1:
                    color = 0xFF0000  # Red - Urgent
                    urgency = '🔴 URGENT'
                elif expires_in_days <= 7:
                    color = 0xFF8C00  # Orange - Soon
                    urgency = '🟠 Soon'
                else:
                    color = 0xFFD700  # Yellow - Notice
                    urgency = '🟡 Notice'
                expiry_text = f'Expires in {expires_in_days} day(s)'
            else:
                color = 0xFF8C00
                urgency = '🟠 Expiring'
                expiry_text = 'Token expiring soon'
            
            embed = {
                'title': f'🔑 Token Expiry Alert - {urgency}',
                'description': f'Authentication token for **{platform}** needs renewal',
                'color': color,
                'fields': [
                    {
                        'name': '👤 User',
                        'value': user_email,
                        'inline': True
                    },
                    {
                        'name': '⏰ Status',
                        'value': expiry_text,
                        'inline': True
                    },
                    {
                        'name': '🔧 Action Required',
                        'value': f'Re-authenticate {platform} integration',
                        'inline': False
                    }
                ],
                'footer': {
                    'text': 'Homelab Integration Monitor'
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Discord token expiry alert sent for {platform}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord token expiry alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending Discord token expiry alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_email_token_expiry(
        self,
        platform: str,
        user_email: str,
        expires_in_days: Optional[int]
    ) -> Dict[str, Any]:
        """Send token expiry alert via email"""
        if not self.notification_email:
            logger.warning("Notification email not configured")
            return {'success': False, 'error': 'Notification email not configured'}
        
        if not self.gmail_service:
            logger.warning("Gmail service not available")
            return {'success': False, 'error': 'Gmail service not available'}
        
        try:
            # Determine urgency
            if expires_in_days is not None:
                if expires_in_days <= 1:
                    emoji = '🔴'
                    urgency = 'URGENT'
                    urgency_color = '#dc2626'
                elif expires_in_days <= 7:
                    emoji = '🟠'
                    urgency = 'WARNING'
                    urgency_color = '#f59e0b'
                else:
                    emoji = '🟡'
                    urgency = 'NOTICE'
                    urgency_color = '#eab308'
                expiry_text = f'Expires in <strong>{expires_in_days} day(s)</strong>'
            else:
                emoji = '🟠'
                urgency = 'WARNING'
                urgency_color = '#f59e0b'
                expiry_text = '<strong>Token expiring soon</strong>'
            
            body = f"""
<div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">{emoji} Token Expiry Alert - {urgency}</h2>
    
    <div style="background-color: #ffffff; padding: 20px; border-radius: 6px; border-left: 4px solid {urgency_color};">
        <p>The authentication token for <strong>{platform}</strong> integration is expiring soon.</p>
        <hr style="border: 1px solid #e5e7eb; margin: 15px 0;">
        <p><strong>User Account:</strong> {user_email}</p>
        <p><strong>Platform:</strong> {platform}</p>
        <p><strong>Status:</strong> {expiry_text}</p>
    </div>
    
    <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <h3 style="color: #991b1b; margin-top: 0; font-size: 16px;">⚠️ Action Required</h3>
        <p style="color: #7f1d1d; margin-bottom: 10px;">To maintain integration functionality:</p>
        <ol style="color: #7f1d1d; margin: 0;">
            <li>Log in to your Homelab Dashboard</li>
            <li>Navigate to Integrations → {platform}</li>
            <li>Click "Re-authenticate" or "Refresh Token"</li>
            <li>Complete the authorization flow</li>
        </ol>
    </div>
    
    <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
        <strong>Note:</strong> If the token expires, the {platform} integration will stop working 
        until you re-authenticate.
    </p>
</div>
"""
            
            result = self.gmail_service.send_email(
                to=self.notification_email,
                subject=f'{emoji} Token Expiry: {platform} - {urgency}',
                body=body,
                template_type='ssl_expiry',
                html=True,
                domain=platform
            )
            
            logger.info(f"Email token expiry alert sent to {self.notification_email}")
            return {'success': True, 'message_id': result.get('id')}
        
        except Exception as e:
            logger.error(f"Failed to send email token expiry alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_webhook_token_expiry(
        self,
        platform: str,
        user_email: str,
        expires_in_days: Optional[int]
    ) -> Dict[str, Any]:
        """Send token expiry alert to generic webhook"""
        if not self.generic_webhook_url:
            logger.warning("Generic webhook URL not configured")
            return {'success': False, 'error': 'Generic webhook not configured'}
        
        try:
            payload = {
                'type': 'token_expiry',
                'data': {
                    'platform': platform,
                    'user_email': user_email,
                    'expires_in_days': expires_in_days
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            response = requests.post(
                self.generic_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Generic webhook token expiry alert sent for {platform}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send generic webhook token expiry alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending generic webhook token expiry alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def send_service_failure_alert(
        self,
        service_name: str,
        failure_data: Dict[str, Any],
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send service failure notification via configured channels
        
        Args:
            service_name: Name of the failed service
            failure_data: Failure information containing:
                - status: Service status (e.g., 'down', 'unhealthy')
                - health_status: Health check result
                - message: Error message or description
                - severity: Alert severity ('critical', 'high', 'medium', 'low')
            channels: List of channels to send to (discord, email, webhook)
                     If None, sends to all configured channels
        
        Returns:
            Dict with notification results per channel
        """
        logger.info(f"Sending service failure alert for {service_name}")
        
        if channels is None:
            channels = self._get_available_channels()
        
        if not channels:
            logger.warning("No notification channels available or specified")
            return {'success': False, 'error': 'No channels configured'}
        
        results = {}
        
        if 'discord' in channels:
            results['discord'] = self._send_discord_service_failure(service_name, failure_data)
        
        if 'email' in channels:
            results['email'] = self._send_email_service_failure(service_name, failure_data)
        
        if 'webhook' in channels:
            results['webhook'] = self._send_webhook_service_failure(service_name, failure_data)
        
        success = any(r.get('success', False) for r in results.values())
        
        logger.info(f"Service failure notification sent: {success}, results: {results}")
        
        return {
            'success': success,
            'results': results,
            'channels': channels
        }
    
    def _send_discord_service_failure(
        self,
        service_name: str,
        failure_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send service failure alert to Discord webhook"""
        if not self.discord_webhook_url:
            logger.warning("Discord webhook URL not configured")
            return {'success': False, 'error': 'Discord webhook not configured'}
        
        try:
            severity = failure_data.get('severity', 'medium').lower()
            status = failure_data.get('status', 'unknown')
            health_status = failure_data.get('health_status', 'unknown')
            message = failure_data.get('message', 'No details available')
            
            if severity == 'critical':
                color = 0xFF0000  # Red
                emoji = '🔴'
            elif severity == 'high':
                color = 0xFF8C00  # Orange
                emoji = '🟠'
            elif severity == 'medium':
                color = 0xFFD700  # Yellow
                emoji = '🟡'
            else:
                color = 0x808080  # Gray
                emoji = '⚪'
            
            embed = {
                'title': f'{emoji} Service Failure Alert',
                'description': f'Service **{service_name}** has encountered an issue',
                'color': color,
                'fields': [
                    {
                        'name': '🔧 Service',
                        'value': service_name,
                        'inline': True
                    },
                    {
                        'name': '📊 Status',
                        'value': status,
                        'inline': True
                    },
                    {
                        'name': '⚠️ Severity',
                        'value': severity.upper(),
                        'inline': True
                    },
                    {
                        'name': '💓 Health Status',
                        'value': health_status,
                        'inline': True
                    },
                    {
                        'name': '📝 Message',
                        'value': message[:1024] if len(message) > 1024 else message,
                        'inline': False
                    }
                ],
                'footer': {
                    'text': 'Homelab Service Monitor'
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Discord service failure alert sent for {service_name}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord service failure alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending Discord service failure alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_email_service_failure(
        self,
        service_name: str,
        failure_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send service failure alert via email"""
        if not self.notification_email:
            logger.warning("Notification email not configured")
            return {'success': False, 'error': 'Notification email not configured'}
        
        if not self.gmail_service:
            logger.warning("Gmail service not available")
            return {'success': False, 'error': 'Gmail service not available'}
        
        try:
            severity = failure_data.get('severity', 'medium').lower()
            status = failure_data.get('status', 'unknown')
            health_status = failure_data.get('health_status', 'unknown')
            message = failure_data.get('message', 'No details available')
            timestamp = datetime.utcnow().isoformat()
            
            if severity == 'critical':
                emoji = '🔴'
                severity_text = 'CRITICAL'
                border_color = '#dc2626'
            elif severity == 'high':
                emoji = '🟠'
                severity_text = 'HIGH'
                border_color = '#f59e0b'
            elif severity == 'medium':
                emoji = '🟡'
                severity_text = 'MEDIUM'
                border_color = '#eab308'
            else:
                emoji = '⚪'
                severity_text = 'LOW'
                border_color = '#6b7280'
            
            body = f"""
<div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">{emoji} Service Failure Alert - {severity_text}</h2>
    
    <div style="background-color: #ffffff; padding: 20px; border-radius: 6px; border-left: 4px solid {border_color};">
        <p><strong>Service Name:</strong> {service_name}</p>
        <p><strong>Status:</strong> <span style="color: {border_color}; font-weight: bold;">{status}</span></p>
        <p><strong>Health Status:</strong> {health_status}</p>
        <p><strong>Severity:</strong> {severity_text}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 15px 0;">
        <p><strong>Error Message:</strong></p>
        <div style="background-color: #fef2f2; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px;">
            {message}
        </div>
        <p style="margin-top: 15px;"><strong>Timestamp:</strong> {timestamp}</p>
    </div>
    
    <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
        <strong>Recommended Actions:</strong><br>
        • Check service logs for detailed error information<br>
        • Verify service dependencies are running<br>
        • Review recent configuration changes<br>
        • Consider restarting the service if appropriate
    </p>
</div>
"""
            
            result = self.gmail_service.send_email(
                to=self.notification_email,
                subject=f'{emoji} Service Failure: {service_name} - {severity_text}',
                body=body,
                template_type='error',
                html=True,
                error_type='Service Failure'
            )
            
            logger.info(f"Email service failure alert sent for {service_name}")
            return {'success': True, 'message_id': result.get('id')}
        
        except Exception as e:
            logger.error(f"Failed to send email service failure alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_webhook_service_failure(
        self,
        service_name: str,
        failure_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send service failure alert to generic webhook"""
        if not self.generic_webhook_url:
            logger.warning("Generic webhook URL not configured")
            return {'success': False, 'error': 'Generic webhook not configured'}
        
        try:
            payload = {
                'type': 'service_failure',
                'data': {
                    'service_name': service_name,
                    **failure_data
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            response = requests.post(
                self.generic_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Generic webhook service failure alert sent for {service_name}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send generic webhook service failure alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending generic webhook service failure alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def send_remediation_alert(
        self,
        service_name: str,
        remediation_result: Dict[str, Any],
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send remediation attempt notification via configured channels
        
        Args:
            service_name: Name of the service that was remediated
            remediation_result: Result from JarvisRemediator containing:
                - success: Whether remediation was successful
                - actions_taken: List of remediation actions performed
                - current_health: Current health status after remediation
                - message: Additional details or error message
            channels: List of channels to send to (discord, email, webhook)
                     If None, sends to all configured channels
        
        Returns:
            Dict with notification results per channel
        """
        logger.info(f"Sending remediation alert for {service_name}")
        
        if channels is None:
            channels = self._get_available_channels()
        
        if not channels:
            logger.warning("No notification channels available or specified")
            return {'success': False, 'error': 'No channels configured'}
        
        results = {}
        
        if 'discord' in channels:
            results['discord'] = self._send_discord_remediation(service_name, remediation_result)
        
        if 'email' in channels:
            results['email'] = self._send_email_remediation(service_name, remediation_result)
        
        if 'webhook' in channels:
            results['webhook'] = self._send_webhook_remediation(service_name, remediation_result)
        
        success = any(r.get('success', False) for r in results.values())
        
        logger.info(f"Remediation notification sent: {success}, results: {results}")
        
        return {
            'success': success,
            'results': results,
            'channels': channels
        }
    
    def _send_discord_remediation(
        self,
        service_name: str,
        remediation_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send remediation alert to Discord webhook"""
        if not self.discord_webhook_url:
            logger.warning("Discord webhook URL not configured")
            return {'success': False, 'error': 'Discord webhook not configured'}
        
        try:
            is_success = remediation_result.get('success', False)
            actions_taken = remediation_result.get('actions_taken', [])
            current_health = remediation_result.get('current_health', 'unknown')
            message = remediation_result.get('message', '')
            
            if is_success:
                color = 0x22C55E  # Green
                emoji = '✅'
                status_text = 'SUCCESSFUL'
            else:
                color = 0xFF0000  # Red
                emoji = '❌'
                status_text = 'FAILED'
            
            actions_text = '\n'.join([f'• {action}' for action in actions_taken]) if actions_taken else 'No actions recorded'
            
            embed = {
                'title': f'{emoji} Remediation {status_text}',
                'description': f'Auto-remediation attempted for **{service_name}**',
                'color': color,
                'fields': [
                    {
                        'name': '🔧 Service',
                        'value': service_name,
                        'inline': True
                    },
                    {
                        'name': '📊 Result',
                        'value': status_text,
                        'inline': True
                    },
                    {
                        'name': '💓 Current Health',
                        'value': current_health,
                        'inline': True
                    },
                    {
                        'name': '🛠️ Actions Taken',
                        'value': actions_text[:1024] if len(actions_text) > 1024 else actions_text,
                        'inline': False
                    }
                ],
                'footer': {
                    'text': 'Jarvis Auto-Remediation'
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            if message:
                embed['fields'].append({
                    'name': '📝 Details',
                    'value': message[:1024] if len(message) > 1024 else message,
                    'inline': False
                })
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Discord remediation alert sent for {service_name}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord remediation alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending Discord remediation alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_email_remediation(
        self,
        service_name: str,
        remediation_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send remediation alert via email"""
        if not self.notification_email:
            logger.warning("Notification email not configured")
            return {'success': False, 'error': 'Notification email not configured'}
        
        if not self.gmail_service:
            logger.warning("Gmail service not available")
            return {'success': False, 'error': 'Gmail service not available'}
        
        try:
            is_success = remediation_result.get('success', False)
            actions_taken = remediation_result.get('actions_taken', [])
            current_health = remediation_result.get('current_health', 'unknown')
            message = remediation_result.get('message', '')
            timestamp = datetime.utcnow().isoformat()
            
            if is_success:
                emoji = '✅'
                status_text = 'SUCCESSFUL'
                border_color = '#22c55e'
                bg_color = '#f0fdf4'
            else:
                emoji = '❌'
                status_text = 'FAILED'
                border_color = '#dc2626'
                bg_color = '#fef2f2'
            
            actions_html = ''.join([f'<li>{action}</li>' for action in actions_taken]) if actions_taken else '<li>No actions recorded</li>'
            
            message_html = ''
            if message:
                message_html = f"""
        <p><strong>Details:</strong></p>
        <div style="background-color: #f9fafb; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px;">
            {message}
        </div>
"""
            
            body = f"""
<div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">{emoji} Remediation {status_text}</h2>
    
    <div style="background-color: {bg_color}; padding: 20px; border-radius: 6px; border-left: 4px solid {border_color};">
        <p>Auto-remediation was attempted for <strong>{service_name}</strong></p>
        <hr style="border: 1px solid #e5e7eb; margin: 15px 0;">
        <p><strong>Service:</strong> {service_name}</p>
        <p><strong>Result:</strong> <span style="color: {border_color}; font-weight: bold;">{status_text}</span></p>
        <p><strong>Current Health:</strong> {current_health}</p>
        <p><strong>Timestamp:</strong> {timestamp}</p>
        
        <p style="margin-top: 15px;"><strong>Actions Taken:</strong></p>
        <ul style="margin: 0;">
            {actions_html}
        </ul>
        
        {message_html}
    </div>
    
    <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
        <strong>Note:</strong> This remediation was performed automatically by Jarvis. 
        {'The service should now be operational.' if is_success else 'Manual intervention may be required.'}
    </p>
</div>
"""
            
            result = self.gmail_service.send_email(
                to=self.notification_email,
                subject=f'{emoji} Remediation {status_text}: {service_name}',
                body=body,
                template_type='default',
                html=True
            )
            
            logger.info(f"Email remediation alert sent for {service_name}")
            return {'success': True, 'message_id': result.get('id')}
        
        except Exception as e:
            logger.error(f"Failed to send email remediation alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_webhook_remediation(
        self,
        service_name: str,
        remediation_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send remediation alert to generic webhook"""
        if not self.generic_webhook_url:
            logger.warning("Generic webhook URL not configured")
            return {'success': False, 'error': 'Generic webhook not configured'}
        
        try:
            payload = {
                'type': 'remediation',
                'data': {
                    'service_name': service_name,
                    **remediation_result
                },
                'timestamp': datetime.utcnow().isoformat()
            }
            
            response = requests.post(
                self.generic_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info(f"Generic webhook remediation alert sent for {service_name}")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send generic webhook remediation alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending generic webhook remediation alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def send_system_health_alert(
        self,
        health_summary: Dict[str, Any],
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send system health overview notification via configured channels
        
        Args:
            health_summary: Health summary from AutonomousMonitor.get_system_summary() containing:
                - issues_found: Number of issues detected
                - services_healthy: Number of healthy services
                - services_unhealthy: Number of unhealthy services
                - services: Dict of service statuses
                - last_check: Timestamp of last health check
                - overall_status: Overall system status
            channels: List of channels to send to (discord, email, webhook)
                     If None, sends to all configured channels
        
        Returns:
            Dict with notification results per channel
        """
        logger.info("Sending system health alert")
        
        if channels is None:
            channels = self._get_available_channels()
        
        if not channels:
            logger.warning("No notification channels available or specified")
            return {'success': False, 'error': 'No channels configured'}
        
        results = {}
        
        if 'discord' in channels:
            results['discord'] = self._send_discord_system_health(health_summary)
        
        if 'email' in channels:
            results['email'] = self._send_email_system_health(health_summary)
        
        if 'webhook' in channels:
            results['webhook'] = self._send_webhook_system_health(health_summary)
        
        success = any(r.get('success', False) for r in results.values())
        
        logger.info(f"System health notification sent: {success}, results: {results}")
        
        return {
            'success': success,
            'results': results,
            'channels': channels
        }
    
    def _send_discord_system_health(
        self,
        health_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send system health alert to Discord webhook"""
        if not self.discord_webhook_url:
            logger.warning("Discord webhook URL not configured")
            return {'success': False, 'error': 'Discord webhook not configured'}
        
        try:
            issues_found = health_summary.get('issues_found', 0)
            services_healthy = health_summary.get('services_healthy', 0)
            services_unhealthy = health_summary.get('services_unhealthy', 0)
            overall_status = health_summary.get('overall_status', 'unknown')
            last_check = health_summary.get('last_check', datetime.utcnow().isoformat())
            services = health_summary.get('services', {})
            
            if issues_found == 0:
                color = 0x22C55E  # Green
                emoji = '✅'
                status_text = 'All Systems Operational'
            elif issues_found <= 3:
                color = 0xFFD700  # Yellow
                emoji = '⚠️'
                status_text = 'Minor Issues Detected'
            else:
                color = 0xFF0000  # Red
                emoji = '🔴'
                status_text = 'Multiple Issues Detected'
            
            unhealthy_services = []
            for service_name, service_data in services.items():
                if isinstance(service_data, dict):
                    if service_data.get('status') != 'healthy' or service_data.get('health_status') not in ['healthy', 'running', 'ok']:
                        unhealthy_services.append(f'• {service_name}: {service_data.get("status", "unknown")}')
            
            unhealthy_text = '\n'.join(unhealthy_services[:10]) if unhealthy_services else 'All services healthy'
            if len(unhealthy_services) > 10:
                unhealthy_text += f'\n... and {len(unhealthy_services) - 10} more'
            
            embed = {
                'title': f'{emoji} System Health Report',
                'description': status_text,
                'color': color,
                'fields': [
                    {
                        'name': '✅ Healthy Services',
                        'value': str(services_healthy),
                        'inline': True
                    },
                    {
                        'name': '❌ Unhealthy Services',
                        'value': str(services_unhealthy),
                        'inline': True
                    },
                    {
                        'name': '⚠️ Issues Found',
                        'value': str(issues_found),
                        'inline': True
                    },
                    {
                        'name': '📊 Overall Status',
                        'value': overall_status,
                        'inline': True
                    }
                ],
                'footer': {
                    'text': 'Homelab Health Monitor'
                },
                'timestamp': last_check if isinstance(last_check, str) else datetime.utcnow().isoformat()
            }
            
            if unhealthy_services:
                embed['fields'].append({
                    'name': '🔧 Services Needing Attention',
                    'value': unhealthy_text[:1024],
                    'inline': False
                })
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(
                self.discord_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info("Discord system health alert sent")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord system health alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending Discord system health alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_email_system_health(
        self,
        health_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send system health alert via email"""
        if not self.notification_email:
            logger.warning("Notification email not configured")
            return {'success': False, 'error': 'Notification email not configured'}
        
        if not self.gmail_service:
            logger.warning("Gmail service not available")
            return {'success': False, 'error': 'Gmail service not available'}
        
        try:
            issues_found = health_summary.get('issues_found', 0)
            services_healthy = health_summary.get('services_healthy', 0)
            services_unhealthy = health_summary.get('services_unhealthy', 0)
            overall_status = health_summary.get('overall_status', 'unknown')
            last_check = health_summary.get('last_check', datetime.utcnow().isoformat())
            services = health_summary.get('services', {})
            
            if issues_found == 0:
                emoji = '✅'
                status_text = 'All Systems Operational'
                border_color = '#22c55e'
                bg_color = '#f0fdf4'
            elif issues_found <= 3:
                emoji = '⚠️'
                status_text = 'Minor Issues Detected'
                border_color = '#eab308'
                bg_color = '#fefce8'
            else:
                emoji = '🔴'
                status_text = 'Multiple Issues Detected'
                border_color = '#dc2626'
                bg_color = '#fef2f2'
            
            services_html = ''
            for service_name, service_data in services.items():
                if isinstance(service_data, dict):
                    service_status = service_data.get('status', 'unknown')
                    health_status = service_data.get('health_status', 'unknown')
                    if service_status == 'healthy' or health_status in ['healthy', 'running', 'ok']:
                        service_icon = '✅'
                        status_color = '#22c55e'
                    else:
                        service_icon = '❌'
                        status_color = '#dc2626'
                    services_html += f'<tr><td>{service_icon} {service_name}</td><td style="color: {status_color};">{service_status}</td><td>{health_status}</td></tr>'
            
            body = f"""
<div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">{emoji} System Health Report</h2>
    
    <div style="background-color: {bg_color}; padding: 20px; border-radius: 6px; border-left: 4px solid {border_color};">
        <h3 style="margin-top: 0; color: #1f2937;">{status_text}</h3>
        <hr style="border: 1px solid #e5e7eb; margin: 15px 0;">
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
            <tr>
                <td style="padding: 8px; background-color: #f9fafb;"><strong>✅ Healthy Services</strong></td>
                <td style="padding: 8px; font-size: 18px; font-weight: bold; color: #22c55e;">{services_healthy}</td>
            </tr>
            <tr>
                <td style="padding: 8px; background-color: #ffffff;"><strong>❌ Unhealthy Services</strong></td>
                <td style="padding: 8px; font-size: 18px; font-weight: bold; color: #dc2626;">{services_unhealthy}</td>
            </tr>
            <tr>
                <td style="padding: 8px; background-color: #f9fafb;"><strong>⚠️ Issues Found</strong></td>
                <td style="padding: 8px; font-size: 18px; font-weight: bold;">{issues_found}</td>
            </tr>
            <tr>
                <td style="padding: 8px; background-color: #ffffff;"><strong>📊 Overall Status</strong></td>
                <td style="padding: 8px; font-weight: bold;">{overall_status}</td>
            </tr>
        </table>
        
        <p><strong>Last Check:</strong> {last_check}</p>
    </div>
    
    <div style="background-color: #ffffff; padding: 20px; border-radius: 6px; margin-top: 20px;">
        <h3 style="margin-top: 0; color: #1f2937;">Service Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background-color: #f9fafb;">
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Service</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Status</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Health</th>
                </tr>
            </thead>
            <tbody>
                {services_html if services_html else '<tr><td colspan="3" style="padding: 8px; text-align: center;">No service data available</td></tr>'}
            </tbody>
        </table>
    </div>
</div>
"""
            
            result = self.gmail_service.send_email(
                to=self.notification_email,
                subject=f'{emoji} System Health: {status_text} ({issues_found} issues)',
                body=body,
                template_type='default',
                html=True
            )
            
            logger.info("Email system health alert sent")
            return {'success': True, 'message_id': result.get('id')}
        
        except Exception as e:
            logger.error(f"Failed to send email system health alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    def _send_webhook_system_health(
        self,
        health_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Send system health alert to generic webhook"""
        if not self.generic_webhook_url:
            logger.warning("Generic webhook URL not configured")
            return {'success': False, 'error': 'Generic webhook not configured'}
        
        try:
            payload = {
                'type': 'system_health',
                'data': health_summary,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            response = requests.post(
                self.generic_webhook_url,
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            logger.info("Generic webhook system health alert sent")
            return {'success': True, 'status_code': response.status_code}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send generic webhook system health alert: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Unexpected error sending generic webhook system health alert: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}


# Global notification service instance
notification_service = NotificationService()
