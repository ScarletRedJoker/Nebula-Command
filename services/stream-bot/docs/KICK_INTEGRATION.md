# Kick Streaming Integration

## Overview
StreamBot includes full Kick streaming platform integration with OAuth authentication, chat bot capabilities, and multi-platform support alongside Twitch and YouTube.

## Implementation Status
✅ **COMPLETE** - Kick integration is fully implemented and operational in StreamBot.

## Features

### Authentication
- **OAuth 2.0 Sign-in**: Users can sign in with their Kick account
- **Platform Linking**: Existing users can link Kick to their account
- **Secure Token Storage**: OAuth tokens are encrypted at rest
- **Synthetic Email Handling**: Kick API doesn't return email, so we generate `kick_{user_id}@kick.local`

### Bot Functionality
- **WebSocket Chat Connection**: Real-time connection to Kick chat using `@retconned/kick-js`
- **Message Sending**: Post facts and messages to Kick chat
- **Message Receiving**: Listen to chat messages for commands and triggers
- **Custom Commands**: Support for viewer-triggered commands (e.g., `!snapple`)
- **Statistics Tracking**: Track messages sent, viewers, and session data
- **Auto-Reconnection**: Automatic reconnection on disconnect

### User Interface
- **OAuth Login Button**: "Sign in with Kick" on login page
- **Platform Connection Card**: Kick card on dashboard with connection status
- **Connection Dialog**: Manual token input option for advanced users
- **Profile Management**: View and manage Kick connection in profile settings

## Technical Implementation

### Backend Components

#### 1. OAuth Configuration
**File**: `services/stream-bot/server/auth/passport-oauth-config.ts`

Kick OAuth2 strategy with:
- Client ID and Secret from environment variables
- Scopes: `user:read`, `chat:read`, `chat:send`
- Callback URL: `/api/auth/kick/callback`
- Synthetic email generation for users without email

```typescript
passport.use('kick-signin', new OAuth2Strategy({
  authorizationURL: 'https://kick.com/oauth2/authorize',
  tokenURL: 'https://kick.com/oauth2/token',
  clientID: getEnv('KICK_CLIENT_ID'),
  clientSecret: getEnv('KICK_CLIENT_SECRET'),
  callbackURL: getEnv('KICK_SIGNIN_CALLBACK_URL'),
}, async (accessToken, refreshToken, profile, done) => {
  // Handle OAuth callback and create/link user
}));
```

#### 2. OAuth Routes
**File**: `services/stream-bot/server/auth/oauth-signin-routes.ts`

Routes:
- `GET /api/auth/kick` - Initiate OAuth flow
- `GET /api/auth/kick/callback` - Handle OAuth callback
- `DELETE /api/auth/unlink/kick` - Disconnect Kick account

#### 3. Bot Worker Service
**File**: `services/stream-bot/server/bot-worker.ts`

Key implementation details:
```typescript
// Kick client properties
private kickClient: KickClient | null = null;
private kickChannelSlug: string | null = null;
private kickClientReady: boolean = false;

// Start Kick client
async startKickClient(connection: PlatformConnection, keywords: string[]) {
  const channelName = connection.platformUsername.toLowerCase();
  this.kickChannelSlug = channelName;
  
  // Create client with channel slug and options
  this.kickClient = createClient(channelName, { logger: false, readOnly: false });
  
  // Wait for ready state
  this.kickClient.on("ready", () => {
    this.kickClientReady = true;
    console.log(`[BotWorker] Kick bot connected to ${channelName}`);
  });
  
  // Listen to chat messages (note: event is "ChatMessage" not "message")
  this.kickClient.on("ChatMessage", async (message) => {
    const username = message.sender.username || "unknown";
    const content = message.content.trim();
    // Handle commands, keywords, etc.
  });
}

// Send message with channel context
async sendMessage(message: string) {
  if (this.kickClient && this.kickClientReady && this.kickChannelSlug) {
    await this.kickClient.sendMessage(this.kickChannelSlug, message);
  }
}
```

**Critical Bug Fixes Applied**:
1. ✅ **Channel Context**: Always pass channel slug to `sendMessage()`
2. ✅ **Ready State Guard**: Check `kickClientReady` before sending
3. ✅ **Better Logging**: Log when messages are skipped due to not-ready state

### Frontend Components

#### 1. OAuth Login Page
**File**: `services/stream-bot/client/src/pages/OAuthLogin.tsx`

- Enabled Kick sign-in button (removed "Coming Soon")
- OAuth flow integration
- Success/error messaging

#### 2. Profile Page
**File**: `services/stream-bot/client/src/pages/Profile.tsx`

- Kick platform connection management
- Connection status display
- Unlink functionality

#### 3. Platform Connection Dialog
**File**: `services/stream-bot/client/src/components/connect-platform-dialog.tsx`

- Kick-specific connection form
- Manual token input option
- OAuth flow option

## Environment Variables

### Required for OAuth Sign-in
```bash
KICK_CLIENT_ID=your_kick_client_id
KICK_CLIENT_SECRET=your_kick_client_secret
KICK_SIGNIN_CALLBACK_URL=https://your-domain.com/api/auth/kick/callback
```

### Alternative Naming (with STREAMBOT_ prefix)
```bash
STREAMBOT_KICK_CLIENT_ID=your_kick_client_id
STREAMBOT_KICK_CLIENT_SECRET=your_kick_client_secret
```

The bot automatically detects both naming conventions.

## Setup Instructions

### 1. Get Kick OAuth Credentials
1. Go to Kick Developer Portal (when available)
2. Create OAuth application
3. Set redirect URI: `https://your-domain.com/api/auth/kick/callback`
4. Copy Client ID and Client Secret

### 2. Configure Environment
Add the environment variables above to your `.env` file.

### 3. Sign In with Kick
1. Go to StreamBot login page
2. Click "Sign in with Kick"
3. Authorize the application
4. You'll be redirected back with connection established

### 4. Start Bot
1. Configure bot settings (keywords, interval, etc.)
2. Toggle "Bot Active" to ON
3. Bot will connect to your Kick chat
4. Test with: `!snapple` in chat

## Supported Features

### Chat Commands
- ✅ Custom commands (e.g., `!snapple`, `!fact`)
- ✅ Keyword triggers
- ✅ Command cooldowns
- ✅ Permission levels (broadcaster, moderator, subscriber, everyone)

### Posting Modes
- ✅ Manual posting (Quick Trigger)
- ✅ Fixed interval posting
- ✅ Random interval posting
- ✅ Chat-triggered posting

### Statistics
- ✅ Message count tracking
- ✅ Viewer count tracking
- ✅ Session tracking
- ✅ Platform-specific statistics

## Known Limitations

### 1. Unofficial API
Kick integration uses `@retconned/kick-js`, an unofficial library:
- **Risk**: May break if Kick changes their API
- **Mitigation**: Monitor library updates and Kick API changes

### 2. Synthetic Email
Kick API doesn't return user email:
- **Current**: Generates `kick_{user_id}@kick.local` on each login
- **Impact**: Consistent login but email not stored in connectionData
- **Future Enhancement**: Persist synthetic email for perfect consistency

### 3. Manual Token Input
For advanced users who prefer manual setup:
- Requires bearer token and cookies from browser
- More complex than OAuth flow
- Recommended for troubleshooting only

## Testing

### Test OAuth Flow
1. Visit `/login` page
2. Click "Sign in with Kick"
3. Verify redirect to Kick
4. Authorize and verify callback
5. Check dashboard for connection status

### Test Bot Functionality
1. Connect Kick account
2. Configure bot settings
3. Start bot (toggle "Bot Active" ON)
4. Check logs for connection confirmation
5. Send `!snapple` in Kick chat
6. Verify bot responds with fact

### Test Multi-Platform
1. Connect Twitch, YouTube, and Kick
2. Start bot
3. Verify bot connects to all three platforms
4. Post fact and verify it appears on all platforms
5. Test commands on each platform

## Troubleshooting

### Bot Not Connecting
- Check environment variables are set correctly
- Verify OAuth credentials are valid
- Check logs for connection errors
- Ensure channel slug is lowercase

### Messages Not Sending
- Verify bot is in ready state (`kickClientReady = true`)
- Check channel slug is passed to `sendMessage()`
- Verify OAuth token has `chat:send` scope
- Check rate limiting isn't blocking messages

### OAuth Flow Failing
- Verify callback URL matches exactly
- Check client ID and secret are correct
- Ensure redirect URI is registered in Kick Developer Portal
- Check browser console for errors

## Architecture Decisions

### Why @retconned/kick-js?
- Most actively maintained Kick library
- WebSocket-based for real-time chat
- Supports both reading and sending messages
- Well-documented and tested

### Why Synthetic Email?
- Kick API doesn't return user email
- Email required for user account creation
- Synthetic email allows consistent user identification
- Future: Could prompt user for real email on first login

### Why Separate OAuth Strategy?
- Allows independent configuration per platform
- Easier to debug platform-specific issues
- Maintains clean separation of concerns
- Supports platform-specific scopes and settings

## Future Enhancements

### High Priority
1. **Persist Synthetic Email**: Store in connectionData for consistency
2. **Bot Timeout Handling**: Reset ready flag if connection hangs
3. **Better Error Messages**: User-friendly error messages for common issues

### Medium Priority
4. **Kick Emotes Support**: Parse and display Kick emotes
5. **Kick Badges**: Display user badges (subscriber, moderator, etc.)
6. **Kick Sub Notifications**: Track and respond to new subscribers

### Low Priority
7. **Kick Raid Support**: Handle incoming and outgoing raids
8. **Kick Host Support**: Track hosts and show appreciation
9. **Advanced Analytics**: Kick-specific analytics and insights

## Resources

- **Library**: [retconned/kick-js](https://github.com/retconned/kick-js)
- **Kick API**: (unofficial) WebSocket-based chat API
- **OAuth Docs**: Kick Developer Portal (when available)

## Support

For issues with Kick integration:
1. Check this documentation first
2. Review logs for error messages
3. Test OAuth flow manually
4. Verify environment variables
5. Check library GitHub issues

---

**Last Updated**: November 14, 2025
**Status**: ✅ Production Ready
