# Development Authentication Bypass

## Overview
This document describes the development authentication bypass implemented for stream-bot to enable testing without OAuth configuration.

## Implementation

### 1. Middleware Updates (`server/auth/middleware.ts`)

Both `requireAuth` and `requireAdmin` middleware functions now check `NODE_ENV`:

- **In development mode**: Automatically populates `req.user` with a default dev user
- **In production mode**: Maintains normal OAuth authentication requirements
- **Dev user details**:
  - ID: `dev-user-00000000-0000-0000-0000-000000000000`
  - Email: `dev@stream-bot.local`
  - Role: `admin`
  - Onboarding: Fully completed

### 2. Server Startup (`server/index.ts`)

Added `ensureDevUser()` function that:

- Runs only when `NODE_ENV=development`
- Creates the default dev user in the database if it doesn't exist
- Logs success/failure to console
- Called during server initialization before routes are registered

### 3. Protected Endpoints

All API endpoints using `requireAuth` now work in development mode:

- ✅ `/api/settings` - Bot configuration
- ✅ `/api/commands` - Custom commands CRUD
- ✅ `/api/messages` - Message history
- ✅ `/api/platforms` - Platform connections
- ✅ `/api/giveaways` - Giveaway management
- ✅ `/api/moderation/*` - Moderation rules and logs
- ✅ `/api/shoutouts/*` - Shoutout configuration
- ✅ `/api/obs/*` - OBS integration
- ✅ `/api/spotify/*` - Spotify integration
- ✅ And all other protected endpoints

## Success Criteria

| Criteria | Status | Notes |
|----------|--------|-------|
| Commands can be created/saved | ✅ | `/api/commands` endpoints work without auth |
| Chatbot settings can be saved | ✅ | `/api/settings` endpoints work without auth |
| No "Authentication required" errors | ✅ | All API calls auto-authenticate in dev mode |
| Production auth remains secure | ✅ | Bypass only activates when `NODE_ENV=development` |

## Security Notes

⚠️ **CRITICAL**: This bypass **ONLY** works in development mode.

- Production environments with `NODE_ENV=production` continue to require OAuth
- The dev user is **NOT** created in production
- All authentication checks remain intact for production deployments

## Testing

To verify the implementation:

1. Start the stream-bot in development mode:
   ```bash
   cd services/stream-bot
   NODE_ENV=development npm run dev
   ```

2. Check the console logs for:
   ```
   ✓ Created default development user (dev@stream-bot.local)
   ```

3. Access any protected API endpoint (e.g., `/api/settings`) - it should return data instead of `401 Unauthorized`

## Console Output

When the server starts in development mode:

```
============================================================
Validating OAuth Configuration...
============================================================
[OAuth warnings if not configured]
✓ Created default development user (dev@stream-bot.local)
[Rest of startup logs...]
8:14:42 AM [express] serving on port 3000
```

## Rollback

To disable this feature:

1. Set `NODE_ENV=production` or remove the NODE_ENV variable
2. The server will require OAuth authentication as normal
3. The dev user will not be created on startup
