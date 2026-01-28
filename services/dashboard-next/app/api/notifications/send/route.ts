import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { notificationService } from '@/lib/notifications';
import type { NotificationChannel, NotificationPayload } from '@/lib/notifications/providers/types';

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    const {
      channels,
      priority,
      email,
      discord,
      webhook,
      template,
      templateData,
      metadata,
    } = body;

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json(
        { error: 'At least one notification channel is required' },
        { status: 400 }
      );
    }

    const validChannels: NotificationChannel[] = ['email', 'discord', 'webhook'];
    const invalidChannels = channels.filter((c: string) => !validChannels.includes(c as NotificationChannel));
    if (invalidChannels.length > 0) {
      return NextResponse.json(
        { error: `Invalid channels: ${invalidChannels.join(', ')}. Valid channels are: ${validChannels.join(', ')}` },
        { status: 400 }
      );
    }

    if (channels.includes('email') && !email) {
      return NextResponse.json(
        { error: 'Email payload is required when using email channel' },
        { status: 400 }
      );
    }

    if (channels.includes('email') && email) {
      if (!email.to) {
        return NextResponse.json(
          { error: 'Email recipient (to) is required' },
          { status: 400 }
        );
      }
      if (!email.subject) {
        return NextResponse.json(
          { error: 'Email subject is required' },
          { status: 400 }
        );
      }
      if (!email.body) {
        return NextResponse.json(
          { error: 'Email body is required' },
          { status: 400 }
        );
      }
    }

    if (channels.includes('discord') && !discord) {
      return NextResponse.json(
        { error: 'Discord payload is required when using discord channel' },
        { status: 400 }
      );
    }

    if (channels.includes('discord') && discord) {
      if (!discord.webhookUrl) {
        return NextResponse.json(
          { error: 'Discord webhook URL is required' },
          { status: 400 }
        );
      }
      if (!discord.content && (!discord.embeds || discord.embeds.length === 0)) {
        return NextResponse.json(
          { error: 'Discord notification requires either content or embeds' },
          { status: 400 }
        );
      }
    }

    if (channels.includes('webhook') && !webhook) {
      return NextResponse.json(
        { error: 'Webhook payload is required when using webhook channel' },
        { status: 400 }
      );
    }

    const payload: NotificationPayload = {
      channels: channels as NotificationChannel[],
      priority,
      email,
      discord,
      webhook,
      template,
      templateData,
      metadata,
    };

    const response = await notificationService.sendNotification(payload);

    return NextResponse.json(response, { 
      status: response.success ? 200 : 207 
    });
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send notification', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const emailAvailable = await notificationService.isEmailAvailable();
    const emailProfile = emailAvailable ? await notificationService.getEmailProfile() : null;

    return NextResponse.json({
      channels: {
        email: {
          available: emailAvailable,
          profile: emailProfile,
        },
        discord: {
          available: true,
          requiresWebhook: true,
        },
        webhook: {
          available: true,
        },
      },
      templates: ['alert', 'success', 'info', 'warning'],
    });
  } catch (error: any) {
    console.error('Failed to get notification status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get notification status', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
