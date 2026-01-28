import { google } from 'googleapis';
import type { GmailSendOptions, NotificationResult } from './types';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

export async function getGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createMimeMessage(options: GmailSendOptions): string {
  const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : '';
  const bccAddresses = options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : '';
  
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  let message = '';
  message += `To: ${toAddresses}\r\n`;
  if (ccAddresses) message += `Cc: ${ccAddresses}\r\n`;
  if (bccAddresses) message += `Bcc: ${bccAddresses}\r\n`;
  if (options.replyTo) message += `Reply-To: ${options.replyTo}\r\n`;
  message += `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  
  if (options.html) {
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += Buffer.from(options.text).toString('base64') + '\r\n\r\n';
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += Buffer.from(options.html).toString('base64') + '\r\n\r\n';
    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/plain; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += Buffer.from(options.text).toString('base64') + '\r\n';
  }
  
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmail(options: GmailSendOptions): Promise<NotificationResult> {
  const timestamp = new Date().toISOString();
  
  try {
    const gmail = await getGmailClient();
    const raw = createMimeMessage(options);
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      },
    });

    return {
      channel: 'email',
      success: true,
      messageId: response.data.id || undefined,
      timestamp,
    };
  } catch (error: any) {
    console.error('Gmail send error:', error);
    return {
      channel: 'email',
      success: false,
      error: error.message || 'Failed to send email',
      timestamp,
    };
  }
}

export async function isGmailConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function getGmailProfile(): Promise<{ email: string } | null> {
  try {
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return {
      email: profile.data.emailAddress || '',
    };
  } catch {
    return null;
  }
}
