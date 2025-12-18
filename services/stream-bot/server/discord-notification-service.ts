interface StreamNotificationPayload {
  userId: string;
  platform: "twitch" | "youtube" | "kick";
  streamUrl: string;
  streamTitle: string;
  game?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
}

interface NotificationResult {
  success: boolean;
  notificationsSent?: number;
  totalServers?: number;
  message?: string;
  error?: string;
}

const DISCORD_BOT_URL = process.env.DISCORD_BOT_URL || "http://localhost:5000";
const STREAM_BOT_WEBHOOK_SECRET = process.env.STREAM_BOT_WEBHOOK_SECRET;

export async function sendDiscordStreamNotification(
  payload: StreamNotificationPayload
): Promise<NotificationResult> {
  if (!STREAM_BOT_WEBHOOK_SECRET) {
    console.warn("[Discord Notification] STREAM_BOT_WEBHOOK_SECRET not configured, skipping notification");
    return { success: false, error: "Webhook secret not configured" };
  }

  const url = `${DISCORD_BOT_URL}/api/stream-notifications/external`;

  console.log(`[Discord Notification] Sending go-live notification for user ${payload.userId} on ${payload.platform}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stream-Bot-Secret": STREAM_BOT_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[Discord Notification] Failed: ${response.status} - ${errorData.error || response.statusText}`);
      return { success: false, error: errorData.error || response.statusText };
    }

    const result = await response.json();
    console.log(`[Discord Notification] Success: ${result.notificationsSent || 0} notifications sent`);
    return {
      success: true,
      notificationsSent: result.notificationsSent,
      totalServers: result.totalServers,
      message: result.message,
    };
  } catch (error) {
    console.error("[Discord Notification] Error calling webhook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function notifyStreamGoLive(
  userId: string,
  platform: "twitch" | "youtube" | "kick",
  streamUrl: string,
  streamTitle: string,
  options?: {
    game?: string;
    thumbnailUrl?: string;
    viewerCount?: number;
  }
): Promise<NotificationResult> {
  return sendDiscordStreamNotification({
    userId,
    platform,
    streamUrl,
    streamTitle,
    ...options,
  });
}
