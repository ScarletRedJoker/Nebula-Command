/**
 * Ticket Utility Functions
 * 
 * Collection of helper functions for working with tickets in the UI.
 * Provides consistent formatting, color coding, and WebSocket connectivity.
 * 
 * Key Features:
 * - Date formatting for consistent display
 * - Discord-themed color palette for categories, statuses, and priorities
 * - WebSocket connection management with auto-reconnect
 * - Type-safe utility functions for ticket operations
 * 
 * @module ticketUtils
 */

import { Ticket, TicketMessage } from "@shared/schema";

/**
 * Format a date for user-friendly display
 * 
 * Converts various date formats to a localized string representation.
 * Handles null/undefined gracefully by returning a placeholder.
 * 
 * @param {Date | string | undefined | null} date - Date to format (Date object, ISO string, or null)
 * @returns {string} Formatted date string or "Unknown date" if invalid
 * 
 * @example
 * formatDate(new Date()) // "1/15/2024, 3:30:45 PM"
 * formatDate("2024-01-15T15:30:45Z") // "1/15/2024, 3:30:45 PM"
 * formatDate(null) // "Unknown date"
 */
export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return "Unknown date";
  
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Get color for ticket category badge
 * 
 * Returns Discord-themed colors for visual distinction between ticket types.
 * Uses Discord's brand colors to maintain consistent theming across the app.
 * 
 * Category Mapping:
 * - 1: General Support (Discord blue) - General questions and assistance
 * - 2: Bug Reports (Discord red) - Technical issues and bugs
 * - 3: Feature Requests (Discord yellow) - New feature suggestions
 * - 4: Account Issues (Discord green) - Account-related problems
 * - Default: Discord blue for unknown categories
 * 
 * @param {number | undefined | null} categoryId - Ticket category ID
 * @returns {string} Hex color code for the category
 */
export function getCategoryColor(categoryId: number | undefined | null): string {
  switch (categoryId) {
    case 1: return "#5865F2"; // General Support - Discord blue
    case 2: return "#F04747"; // Bug Reports - Discord red
    case 3: return "#FAA61A"; // Feature Requests - Discord yellow
    case 4: return "#43B581"; // Account Issues - Discord green
    default: return "#5865F2"; // Default - Discord blue
  }
}

/**
 * Get color for ticket status badge
 * 
 * Visual indication of ticket state using Discord's brand colors.
 * Helps users quickly identify ticket status at a glance.
 * 
 * @param {string} status - Ticket status ("open", "closed", etc.)
 * @returns {string} Hex color code for the status
 */
export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "open": return "#43B581"; // Discord green - active/ready
    case "closed": return "#F04747"; // Discord red - resolved/done
    default: return "#5865F2"; // Discord blue - other states
  }
}

/**
 * Get color for ticket priority badge
 * 
 * Color codes tickets by urgency level using Discord-themed colors.
 * Allows quick visual triage of tickets by importance.
 * 
 * Priority Levels (highest to lowest):
 * - Urgent: Yellow - Needs immediate attention
 * - High: Red - Important, handle soon
 * - Normal: Blue - Standard priority
 * - Low: Green - Handle when convenient
 * 
 * @param {string} priority - Priority level string
 * @returns {string} Hex color code for the priority
 */
export function getPriorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "urgent": return "#FAA61A"; // Discord yellow - needs attention now
    case "high": return "#F04747"; // Discord red - important
    case "normal": return "#5865F2"; // Discord blue - standard
    case "low": return "#43B581"; // Discord green - low priority
    default: return "#5865F2"; // Discord blue - default
  }
}

/**
 * Establish WebSocket connection for real-time ticket updates
 * 
 * Creates and manages a WebSocket connection to receive live updates about tickets.
 * Implements automatic reconnection on disconnect for reliability.
 * 
 * Connection Flow:
 * 1. Determine WebSocket URL (custom env var or auto-detect from current host)
 * 2. Establish connection
 * 3. Send authentication message if userId provided
 * 4. Handle incoming messages via callback
 * 5. Auto-reconnect on disconnect with 5s delay
 * 
 * Why auto-reconnect:
 * - Network interruptions are common (mobile, wifi, etc)
 * - Server restarts during development
 * - Maintains real-time updates without user intervention
 * 
 * @param {Function} onMessage - Callback function to handle incoming WebSocket messages
 * @param {string} [userId] - Optional user ID to authenticate the WebSocket connection
 * @returns {WebSocket} The WebSocket instance
 * 
 * @example
 * const ws = connectWebSocket((data) => {
 *   if (data.type === 'ticket_update') {
 *     updateTicketInUI(data.ticket);
 *   }
 * }, user.id);
 */
export function connectWebSocket(onMessage: (data: any) => void, userId?: string): WebSocket {
  /**
   * Determine WebSocket URL
   * 
   * Why we need custom URL support:
   * - Development: May use custom domains (e.g., Replit's *.repl.co)
   * - Production: Custom domains with different WS endpoints
   * - Testing: Point to different backend servers
   */
  const customWsUrl = import.meta.env.VITE_CUSTOM_WS_URL;
  
  let wsUrl;
  if (customWsUrl) {
    // Use explicit WebSocket URL from environment
    wsUrl = customWsUrl;
  } else {
    // Auto-detect from current page (HTTP -> WS, HTTPS -> WSS)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.host}/ws`;
  }
  
  const socket = new WebSocket(wsUrl);
  
  /**
   * Connection established handler
   * Sends authentication message if user is logged in
   */
  socket.onopen = () => {
    console.log('WebSocket connection established');
    
    /**
     * Authenticate the WebSocket connection
     * 
     * Why authenticate:
     * - Server can send user-specific updates
     * - Enables permission checks on server side
     * - Associates WS connection with session
     */
    if (userId) {
      socket.send(JSON.stringify({
        type: 'auth',
        userId
      }));
    }
  };
  
  /**
   * Message received handler
   * Parses JSON and passes to callback
   */
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
  
  /**
   * Error handler
   * Logs errors for debugging
   */
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  /**
   * Connection closed handler
   * Implements auto-reconnect after 5 second delay
   * 
   * Why 5 seconds:
   * - Prevents rapid reconnection loops that could overload server
   * - Gives server time to restart if needed
   * - Long enough to avoid hammering, short enough for good UX
   */
  socket.onclose = () => {
    console.log('WebSocket connection closed');
    // Attempt to reconnect after a delay
    setTimeout(() => {
      connectWebSocket(onMessage, userId);
    }, 5000);
  };
  
  return socket;
}
