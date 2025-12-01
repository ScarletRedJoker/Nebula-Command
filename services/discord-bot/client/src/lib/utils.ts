import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { generateDiscordInviteURL, calculateBotPermissions, DISCORD_PERMISSIONS } from "@shared/discord-constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export Discord constants and utilities for backward compatibility
export { DISCORD_PERMISSIONS, calculateBotPermissions, generateDiscordInviteURL };

/**
 * Get the Discord bot invite URL from the server
 * @returns Promise that resolves to the complete Discord invite URL or null if not available
 */
export async function getBotInviteURL(): Promise<string | null> {
  try {
    const response = await fetch('/api/bot/invite-url');
    if (!response.ok) {
      console.error('Failed to fetch bot invite URL:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.inviteURL || null;
  } catch (error) {
    console.error('Error fetching bot invite URL:', error);
    return null;
  }
}