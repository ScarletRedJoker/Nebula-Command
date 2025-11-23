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


# Global notification service instance
notification_service = NotificationService()
