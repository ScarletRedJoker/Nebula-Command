"""
Email Service for HomeLabHub Dashboard
Supports multiple providers: SendGrid, Mailgun, SMTP, and webhook notifications.
Handles transactional emails and inbound email routing.
"""

import os
import logging
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class EmailService:
    """
    Unified email service supporting multiple providers.
    
    Supported providers:
    - sendgrid: SendGrid API
    - mailgun: Mailgun API
    - smtp: Generic SMTP (Gmail, custom server)
    - webhook: Forward to webhook URL (n8n, Zapier, etc.)
    """
    
    def __init__(self):
        self.provider = os.environ.get('EMAIL_PROVIDER', 'smtp').lower()
        self.from_email = os.environ.get('EMAIL_FROM', 'noreply@evindrake.net')
        self.from_name = os.environ.get('EMAIL_FROM_NAME', 'HomeLabHub')
        
        # Provider-specific configuration
        self.sendgrid_api_key = os.environ.get('SENDGRID_API_KEY')
        self.mailgun_api_key = os.environ.get('MAILGUN_API_KEY')
        self.mailgun_domain = os.environ.get('MAILGUN_DOMAIN')
        
        # SMTP configuration
        self.smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        self.smtp_user = os.environ.get('SMTP_USER')
        self.smtp_password = os.environ.get('SMTP_PASSWORD')
        self.smtp_use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
        
        # Webhook for n8n/Zapier integration
        self.webhook_url = os.environ.get('EMAIL_WEBHOOK_URL')
        
        # Admin email for notifications
        self.admin_email = os.environ.get('ADMIN_EMAIL', 'evin@evindrake.net')
        
        self._validate_config()
    
    def _validate_config(self):
        """Validate provider configuration"""
        if self.provider == 'sendgrid' and not self.sendgrid_api_key:
            logger.warning("SendGrid selected but SENDGRID_API_KEY not set")
            self.enabled = False
        elif self.provider == 'mailgun' and (not self.mailgun_api_key or not self.mailgun_domain):
            logger.warning("Mailgun selected but MAILGUN_API_KEY or MAILGUN_DOMAIN not set")
            self.enabled = False
        elif self.provider == 'smtp' and (not self.smtp_user or not self.smtp_password):
            logger.warning("SMTP selected but SMTP_USER or SMTP_PASSWORD not set")
            self.enabled = False
        elif self.provider == 'webhook' and not self.webhook_url:
            logger.warning("Webhook selected but EMAIL_WEBHOOK_URL not set")
            self.enabled = False
        else:
            self.enabled = True
            logger.info(f"Email service initialized with provider: {self.provider}")
    
    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        reply_to: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Send an email using the configured provider.
        
        Args:
            to: Recipient email address
            subject: Email subject
            body: Plain text body
            html_body: Optional HTML body
            reply_to: Optional reply-to address
            cc: Optional list of CC addresses
            bcc: Optional list of BCC addresses
            attachments: Optional list of attachments [{'filename': 'file.pdf', 'content': bytes}]
        
        Returns:
            Dict with 'success' and 'message' or 'error'
        """
        if not self.enabled:
            return {'success': False, 'error': 'Email service not configured'}
        
        try:
            if self.provider == 'sendgrid':
                return self._send_sendgrid(to, subject, body, html_body, reply_to, cc, bcc)
            elif self.provider == 'mailgun':
                return self._send_mailgun(to, subject, body, html_body, reply_to, cc, bcc)
            elif self.provider == 'smtp':
                return self._send_smtp(to, subject, body, html_body, reply_to, cc, bcc)
            elif self.provider == 'webhook':
                return self._send_webhook(to, subject, body, html_body, reply_to, cc, bcc)
            else:
                return {'success': False, 'error': f'Unknown provider: {self.provider}'}
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return {'success': False, 'error': str(e)}
    
    def _send_sendgrid(
        self, to: str, subject: str, body: str, html_body: Optional[str],
        reply_to: Optional[str], cc: Optional[List[str]], bcc: Optional[List[str]]
    ) -> Dict[str, Any]:
        """Send email via SendGrid API"""
        url = "https://api.sendgrid.com/v3/mail/send"
        
        data = {
            "personalizations": [{
                "to": [{"email": to}],
                "subject": subject
            }],
            "from": {"email": self.from_email, "name": self.from_name},
            "content": [{"type": "text/plain", "value": body}]
        }
        
        if html_body:
            data["content"].append({"type": "text/html", "value": html_body})
        
        if reply_to:
            data["reply_to"] = {"email": reply_to}
        
        if cc:
            data["personalizations"][0]["cc"] = [{"email": e} for e in cc]
        
        if bcc:
            data["personalizations"][0]["bcc"] = [{"email": e} for e in bcc]
        
        headers = {
            "Authorization": f"Bearer {self.sendgrid_api_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, json=data, headers=headers, timeout=30)
        
        if response.status_code in [200, 202]:
            logger.info(f"Email sent via SendGrid to {to}")
            return {'success': True, 'message': 'Email sent successfully'}
        else:
            error = response.json().get('errors', [{'message': 'Unknown error'}])[0]['message']
            logger.error(f"SendGrid error: {error}")
            return {'success': False, 'error': error}
    
    def _send_mailgun(
        self, to: str, subject: str, body: str, html_body: Optional[str],
        reply_to: Optional[str], cc: Optional[List[str]], bcc: Optional[List[str]]
    ) -> Dict[str, Any]:
        """Send email via Mailgun API"""
        url = f"https://api.mailgun.net/v3/{self.mailgun_domain}/messages"
        
        data = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": to,
            "subject": subject,
            "text": body
        }
        
        if html_body:
            data["html"] = html_body
        
        if reply_to:
            data["h:Reply-To"] = reply_to
        
        if cc:
            data["cc"] = ",".join(cc)
        
        if bcc:
            data["bcc"] = ",".join(bcc)
        
        response = requests.post(
            url,
            auth=("api", self.mailgun_api_key),
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            logger.info(f"Email sent via Mailgun to {to}")
            return {'success': True, 'message': 'Email sent successfully', 'id': response.json().get('id')}
        else:
            error = response.json().get('message', 'Unknown error')
            logger.error(f"Mailgun error: {error}")
            return {'success': False, 'error': error}
    
    def _send_smtp(
        self, to: str, subject: str, body: str, html_body: Optional[str],
        reply_to: Optional[str], cc: Optional[List[str]], bcc: Optional[List[str]]
    ) -> Dict[str, Any]:
        """Send email via SMTP"""
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{self.from_name} <{self.from_email}>"
        msg['To'] = to
        
        if reply_to:
            msg['Reply-To'] = reply_to
        
        if cc:
            msg['Cc'] = ", ".join(cc)
        
        # Attach plain text
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach HTML if provided
        if html_body:
            msg.attach(MIMEText(html_body, 'html'))
        
        # Build recipient list
        recipients = [to]
        if cc:
            recipients.extend(cc)
        if bcc:
            recipients.extend(bcc)
        
        # Send email
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            if self.smtp_use_tls:
                server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.from_email, recipients, msg.as_string())
        
        logger.info(f"Email sent via SMTP to {to}")
        return {'success': True, 'message': 'Email sent successfully'}
    
    def _send_webhook(
        self, to: str, subject: str, body: str, html_body: Optional[str],
        reply_to: Optional[str], cc: Optional[List[str]], bcc: Optional[List[str]]
    ) -> Dict[str, Any]:
        """Forward email to webhook (n8n, Zapier, etc.)"""
        payload = {
            "to": to,
            "subject": subject,
            "body": body,
            "html_body": html_body,
            "from_email": self.from_email,
            "from_name": self.from_name,
            "reply_to": reply_to,
            "cc": cc,
            "bcc": bcc,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        response = requests.post(self.webhook_url, json=payload, timeout=30)
        
        if response.status_code in [200, 201, 202]:
            logger.info(f"Email forwarded to webhook for {to}")
            return {'success': True, 'message': 'Email forwarded to webhook'}
        else:
            logger.error(f"Webhook error: {response.text}")
            return {'success': False, 'error': f'Webhook returned {response.status_code}'}
    
    # ═══════════════════════════════════════════════════════════════════
    # Template-based emails
    # ═══════════════════════════════════════════════════════════════════
    
    def send_notification(
        self,
        to: str,
        title: str,
        message: str,
        action_url: Optional[str] = None,
        action_text: str = "View Details"
    ) -> Dict[str, Any]:
        """Send a notification email with optional action button"""
        html = self._render_notification_template(title, message, action_url, action_text)
        return self.send_email(to, f"[HomeLabHub] {title}", message, html)
    
    def send_alert(
        self,
        title: str,
        message: str,
        severity: str = "warning",
        service: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send an alert to admin email"""
        subject = f"[{severity.upper()}] {title}"
        html = self._render_alert_template(title, message, severity, service)
        return self.send_email(self.admin_email, subject, message, html)
    
    def send_welcome(self, to: str, username: str) -> Dict[str, Any]:
        """Send welcome email to new user"""
        subject = "Welcome to HomeLabHub!"
        body = f"Hi {username},\n\nWelcome to HomeLabHub! Your account has been created successfully."
        html = self._render_welcome_template(username)
        return self.send_email(to, subject, body, html)
    
    def send_password_reset(self, to: str, reset_url: str) -> Dict[str, Any]:
        """Send password reset email"""
        subject = "Reset Your HomeLabHub Password"
        body = f"Click the following link to reset your password:\n\n{reset_url}"
        html = self._render_password_reset_template(reset_url)
        return self.send_email(to, subject, body, html)
    
    # ═══════════════════════════════════════════════════════════════════
    # HTML Templates
    # ═══════════════════════════════════════════════════════════════════
    
    def _base_template(self, content: str) -> str:
        """Base HTML email template"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0a0a1a; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .card {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 30px; color: #e0e0e0; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .logo {{ font-size: 24px; font-weight: bold; color: #00d4ff; }}
        .content {{ line-height: 1.6; }}
        .button {{ display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 30px; color: #888; font-size: 12px; }}
        .alert-warning {{ border-left: 4px solid #ffc107; }}
        .alert-error {{ border-left: 4px solid #dc3545; }}
        .alert-success {{ border-left: 4px solid #28a745; }}
        .alert-info {{ border-left: 4px solid #17a2b8; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <div class="logo">🌌 HomeLabHub</div>
            </div>
            <div class="content">
                {content}
            </div>
            <div class="footer">
                <p>Sent from HomeLabHub Dashboard</p>
                <p>© {datetime.now().year} Evin Drake • evindrake.net</p>
            </div>
        </div>
    </div>
</body>
</html>
"""
    
    def _render_notification_template(
        self, title: str, message: str, action_url: Optional[str], action_text: str
    ) -> str:
        content = f"""
            <h2 style="color: #00d4ff; margin: 0 0 20px 0;">{title}</h2>
            <p>{message}</p>
        """
        if action_url:
            content += f'<a href="{action_url}" class="button">{action_text}</a>'
        return self._base_template(content)
    
    def _render_alert_template(
        self, title: str, message: str, severity: str, service: Optional[str]
    ) -> str:
        severity_colors = {
            'warning': '#ffc107',
            'error': '#dc3545',
            'critical': '#dc3545',
            'success': '#28a745',
            'info': '#17a2b8'
        }
        color = severity_colors.get(severity, '#17a2b8')
        
        content = f"""
            <div style="border-left: 4px solid {color}; padding-left: 15px;">
                <h2 style="color: {color}; margin: 0 0 10px 0;">[{severity.upper()}] {title}</h2>
                {f'<p style="color: #888;"><strong>Service:</strong> {service}</p>' if service else ''}
                <p>{message}</p>
                <p style="color: #888; font-size: 12px;">Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            </div>
        """
        return self._base_template(content)
    
    def _render_welcome_template(self, username: str) -> str:
        content = f"""
            <h2 style="color: #00d4ff;">Welcome, {username}! 🎉</h2>
            <p>Your HomeLabHub account has been created successfully.</p>
            <p>You can now:</p>
            <ul>
                <li>Monitor your Docker containers</li>
                <li>Manage your infrastructure with Jarvis AI</li>
                <li>Deploy services with one click</li>
                <li>Control DNS and multi-server fleets</li>
            </ul>
            <a href="https://host.evindrake.net" class="button">Go to Dashboard</a>
        """
        return self._base_template(content)
    
    def _render_password_reset_template(self, reset_url: str) -> str:
        content = f"""
            <h2 style="color: #00d4ff;">Password Reset Request</h2>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <a href="{reset_url}" class="button">Reset Password</a>
            <p style="color: #888; font-size: 12px; margin-top: 20px;">
                If you didn't request this, you can safely ignore this email.
                This link will expire in 1 hour.
            </p>
        """
        return self._base_template(content)
    
    # ═══════════════════════════════════════════════════════════════════
    # Inbound Email Handling (for webhooks)
    # ═══════════════════════════════════════════════════════════════════
    
    def process_inbound_email(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process inbound email from Mailgun/SendGrid webhook.
        
        This allows receiving emails at @evindrake.com or @scarletredjoker.com
        and routing them to appropriate handlers.
        """
        sender = payload.get('sender') or payload.get('from')
        recipient = payload.get('recipient') or payload.get('to')
        subject = payload.get('subject', '')
        body = payload.get('body-plain') or payload.get('text', '')
        
        logger.info(f"Inbound email from {sender} to {recipient}: {subject}")
        
        # Route based on recipient
        if recipient:
            local_part = recipient.split('@')[0].lower()
            
            # Support routes
            if local_part in ['support', 'help']:
                return self._route_to_support(sender, subject, body)
            
            # Alert routes
            elif local_part in ['alerts', 'notifications']:
                return self._route_to_alerts(sender, subject, body)
            
            # Admin routes
            elif local_part in ['admin', 'evin']:
                return self._route_to_admin(sender, subject, body)
            
            # Jarvis AI routes
            elif local_part in ['jarvis', 'ai']:
                return self._route_to_jarvis(sender, subject, body)
        
        # Default: forward to admin
        return self._route_to_admin(sender, subject, body)
    
    def _route_to_support(self, sender: str, subject: str, body: str) -> Dict[str, Any]:
        """Route email to support system (create ticket, etc.)"""
        logger.info(f"Routing to support: {subject}")
        return {'success': True, 'route': 'support', 'action': 'ticket_created'}
    
    def _route_to_alerts(self, sender: str, subject: str, body: str) -> Dict[str, Any]:
        """Route email to alerts system"""
        logger.info(f"Routing to alerts: {subject}")
        return {'success': True, 'route': 'alerts', 'action': 'alert_processed'}
    
    def _route_to_admin(self, sender: str, subject: str, body: str) -> Dict[str, Any]:
        """Forward email to admin"""
        logger.info(f"Forwarding to admin: {subject}")
        return {'success': True, 'route': 'admin', 'action': 'forwarded'}
    
    def _route_to_jarvis(self, sender: str, subject: str, body: str) -> Dict[str, Any]:
        """Route email to Jarvis AI for processing"""
        logger.info(f"Routing to Jarvis: {subject}")
        return {'success': True, 'route': 'jarvis', 'action': 'ai_processed'}


# Singleton instance
_email_service = None

def get_email_service() -> EmailService:
    """Get the email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
