# Giveaway & Raffle System

Complete multi-platform giveaway system for stream engagement.

## Features

- **Multi-Platform Support**: Works with Twitch, YouTube, and Kick
- **Subscriber-Only Mode**: Optional subscriber-only giveaways
- **Multi-Winner Support**: Select multiple winners (1-20)
- **Real-Time Updates**: Live entry counter via WebSocket
- **Automatic Announcements**: Chat announcements for start and winners
- **Entry Tracking**: Full history of all entries and winners

## Database Schema

### Giveaways Table
```typescript
{
  id: string (UUID)
  userId: string (foreign key to users)
  title: string
  keyword: string (e.g., "!enter")
  isActive: boolean
  requiresSubscription: boolean
  maxWinners: number (1-20)
  startedAt: timestamp
  endedAt: timestamp | null
  createdAt: timestamp
}
```

### Giveaway Entries Table
```typescript
{
  id: string (UUID)
  giveawayId: string (foreign key to giveaways)
  userId: string (foreign key to users)
  username: string
  platform: string ('twitch' | 'youtube' | 'kick')
  subscriberStatus: boolean
  enteredAt: timestamp
}
```

### Giveaway Winners Table
```typescript
{
  id: string (UUID)
  giveawayId: string (foreign key to giveaways)
  username: string
  platform: string
  selectedAt: timestamp
}
```

## Backend API Endpoints

### Create Giveaway
```
POST /api/giveaways
Authorization: Required

Body:
{
  title: string
  keyword: string
  requiresSubscription: boolean
  maxWinners: number (1-20)
}

Response:
{
  id: string
  userId: string
  title: string
  keyword: string
  isActive: true
  requiresSubscription: boolean
  maxWinners: number
  startedAt: string
  endedAt: null
  createdAt: string
}
```

Automatically announces in chat: 
`🎁 Giveaway Started: "[Title]"! Type [keyword] in chat to enter. Drawing [N] winner(s)!`

### Get Active Giveaway
```
GET /api/giveaways/active
Authorization: Required

Response:
{
  ...giveaway fields
  entriesCount: number
  winnersCount: number
  winners: GiveawayWinner[]
}
```

### Get Giveaway Entries
```
GET /api/giveaways/:id/entries
Authorization: Required

Response: GiveawayEntry[]
```

### End Giveaway
```
POST /api/giveaways/:id/end
Authorization: Required

Response:
{
  giveaway: Giveaway (isActive: false, endedAt: timestamp)
  winners: GiveawayWinner[]
}
```

Automatically announces in chat:
`🎉 Giveaway Winner: @username! Congratulations! 🎉`
or
`🎉 Giveaway Winners: @user1, @user2, @user3! Congratulations! 🎉`

### Cancel Giveaway
```
DELETE /api/giveaways/:id
Authorization: Required

Response: { success: true }
```

### Get Giveaway History
```
GET /api/giveaways
Authorization: Required
Query Params:
  - limit: number (default: 50)

Response: GiveawayWithStats[]
```

## Bot Integration

### Entry Processing

When a user types the entry keyword (e.g., `!enter`) in chat:

1. **Check if giveaway is active**
2. **Validate subscriber status** (if requiresSubscription is enabled)
3. **Check for duplicate entries** (one entry per user per giveaway)
4. **Add entry to database**
5. **Send confirmation** to user: `@username, you're entered in the giveaway!`
6. **Emit WebSocket event** for real-time UI update

### Chat Announcements

**On Giveaway Start:**
```
🎁 Giveaway Started: "[Title]"! Type !enter in chat to enter. Drawing 1 winner!
🎁 Giveaway Started: "[Title]" (Subscribers Only)! Type !enter in chat to enter. Drawing 3 winners!
```

**On Giveaway End:**
```
🎉 Giveaway Winner: @username! Congratulations! 🎉
🎉 Giveaway Winners: @user1, @user2, @user3! Congratulations! 🎉
```

## Giveaway Service Methods

### createGiveaway(userId, config)
Creates a new giveaway and automatically starts it. Returns the created giveaway.

### enterGiveaway(giveawayId, username, platform, isSubscriber)
Enters a user into the active giveaway. Returns success status and message.

### endGiveaway(giveawayId)
Ends the giveaway, selects random winners, and returns the results. Uses cryptographically secure random selection.

### getActiveGiveaway(userId)
Gets the currently active giveaway for a user with entry/winner counts.

### getGiveawayEntries(giveawayId)
Gets all entries for a specific giveaway.

### getGiveawayHistory(userId, limit)
Gets past giveaways with statistics.

### cancelGiveaway(giveawayId)
Cancels an active giveaway without selecting winners.

## Frontend UI

### Giveaway Management Page
Location: `/giveaways`

**Features:**
- Create giveaway dialog with form validation
- Active giveaway card with live entry counter
- End/Cancel buttons for active giveaway
- Winner display with copy-to-clipboard
- Giveaway history table with filters
- Real-time WebSocket updates

**Create Giveaway Form:**
- Title (required, max 100 chars)
- Entry Keyword (required, max 50 chars, auto-prefixed with !)
- Number of Winners (1-20)
- Subscribers Only toggle

**Active Giveaway Display:**
- Title and status badge
- Entry keyword
- Live entry count
- Number of winners to select
- Subscriber-only indicator
- Duration since start
- End & Pick Winners button
- Cancel button

**Winner Display:**
- Winner names with platform badges
- Copy winners to clipboard button
- Visual trophy icons

**History Table:**
- Title, keyword, status
- Duration, entries, winners
- Date started

## WebSocket Events

### giveaway_entry
Emitted when a user enters the giveaway.
```typescript
{
  type: "giveaway_entry"
  userId: string
  data: {
    giveawayId: string
    username: string
    platform: string
    totalEntries: number
  }
}
```

## Security Features

- **Cryptographically Secure Random Selection**: Uses `crypto.randomBytes()` for winner selection
- **Duplicate Entry Prevention**: Each user can only enter once per giveaway
- **User Isolation**: Users can only access their own giveaways
- **Input Validation**: All inputs validated with Zod schemas
- **Authentication Required**: All endpoints require authentication

## Usage Example

### Starting a Giveaway
1. User clicks "Start Giveaway" button
2. Fills out form with title, keyword, and settings
3. System creates giveaway and announces in all connected platforms
4. Bot begins listening for the entry keyword
5. Entry counter updates in real-time as users enter

### Ending a Giveaway
1. User clicks "End & Pick Winners"
2. System randomly selects winners using secure random selection
3. Winners are announced in all connected platforms
4. UI displays winners with copy-to-clipboard option
5. Giveaway marked as ended in history

## Error Handling

- **No Active Giveaway**: Returns null for getActiveGiveaway
- **Already Active Giveaway**: Returns 400 error on create attempt
- **No Entries**: Returns 400 error on end attempt
- **Already Ended**: Returns 400 error on end/cancel attempt
- **Duplicate Entry**: Returns message to user, doesn't create duplicate
- **Subscriber Check Failed**: Returns message to user if not subscribed

## Platform-Specific Notes

### Twitch
- Subscriber status available via chat tags
- Bot requires moderator permissions for announcements

### YouTube
- Requires active livestream for chat integration
- Subscriber status available via API

### Kick
- Basic subscriber status support
- Chat message posting via Kick API
