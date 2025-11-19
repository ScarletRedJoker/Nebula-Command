# 📘 Nebula Command User Manual

**Complete guide to using all features of your AI Homelab Management System**

---

## 📑 Table of Contents

1. [Getting Started](#getting-started)
2. [Nebula Command Dashboard](#nebula-command-dashboard)
3. [Stream Bot](#stream-bot)
4. [Discord Ticket Bot](#discord-ticket-bot)
5. [Smart Home Integration](#smart-home-integration)
6. [Tips & Best Practices](#tips--best-practices)

---

## 🚀 Getting Started

### Accessing Your Services

After deployment, access your services at these URLs:

| Service | URL | Description |
|---------|-----|-------------|
| **Nebula Command Dashboard** | `https://host.yourdomain.com` | Main management interface |
| **Stream Bot** | `https://stream.yourdomain.com` | Multi-platform streaming bot |
| **Discord Bot** | `https://bot.yourdomain.com` | Discord ticket system |
| **Home Assistant** | `https://homeassistant:8123` | Smart home control |
| **Plex** | `https://plex.yourdomain.com` | Media server |
| **n8n** | `https://n8n.yourdomain.com` | Workflow automation |
| **VNC Desktop** | `https://vnc.yourdomain.com` | Remote desktop |
| **Code Server** | `https://code.yourdomain.com` | VS Code in browser |

### First Login

1. Navigate to your Dashboard URL
2. Enter your credentials (configured during deployment)
3. You'll see the main dashboard with service overview

---

## 🎛️ Nebula Command Dashboard

### Dashboard Overview

The main dashboard provides:
- **Real-time system metrics** (CPU, RAM, disk usage)
- **Service status indicators** (15 services monitored)
- **Quick action buttons** (start/stop/restart services)
- **Recent activity log**
- **System health alerts**

#### Understanding Service Status

| Status | Icon | Meaning |
|--------|------|---------|
| **Running** | 🟢 | Service is healthy and operational |
| **Starting** | 🟡 | Service is initializing |
| **Stopped** | 🔴 | Service is not running |
| **Error** | ⚠️ | Service encountered an error |

### Jarvis AI Assistant

**Access:** Dashboard → AI Assistant tab (or voice button 🎤)

Jarvis is your AI-powered homelab assistant with natural language understanding.

#### Text Chat Interface

**Example conversations:**

```
You: "Show me running services"
Jarvis: I found 15 services running. Here's the breakdown:
        - homelab-dashboard (healthy)
        - stream-bot (healthy)
        - discord-bot (healthy)
        ...

You: "Restart the stream bot"
Jarvis: Restarting stream-bot container now... ✓ Complete
        The service is back online and healthy.

You: "What's using the most CPU?"
Jarvis: Top CPU consumers:
        1. homelab-celery-worker (23%)
        2. stream-bot (18%)
        3. homelab-dashboard (12%)
```

#### Voice Commands

**Available voice commands:**

| Command | Action |
|---------|--------|
| "Install WordPress" | Launches marketplace installation wizard |
| "Show system status" | Displays service health overview |
| "Restart [service]" | Restarts specified service |
| "Show logs for [service]" | Displays recent logs |
| "Deploy [app]" | Starts deployment workflow |

**Using voice:**
1. Click microphone icon 🎤
2. Speak your command clearly
3. Wait for speech recognition
4. Jarvis processes and responds

#### Marketplace Integration

**Natural language app installation:**

```
You: "Install WordPress"
Jarvis: I'll help you install WordPress. Let me gather some information:

        1. What should we name this installation?
        2. Which domain should WordPress use?
        3. Would you like a database (MySQL recommended)?

        I can configure everything automatically or walk you through step-by-step.

You: "Call it 'myblog' on blog.mydomain.com with MySQL"
Jarvis: Perfect! Creating:
        ✓ WordPress container (myblog)
        ✓ MySQL database (myblog_db)
        ✓ Caddy reverse proxy (blog.mydomain.com)
        ✓ SSL certificate (auto-provisioned)
        
        Deployment starting... check Marketplace tab for progress.
```

#### Service Management Commands

Jarvis can manage all 15 services:

```
"Start all services"
"Stop the Plex server"
"Restart Redis"
"Show Discord bot logs"
"What's the status of n8n?"
```

### Service Management

**Access:** Dashboard → Services tab

#### Starting/Stopping Services

**Individual service:**
1. Find service in list
2. Click action button (▶️ Start / ⏸️ Stop / 🔄 Restart)
3. Confirm action
4. Monitor status indicator

**Bulk operations:**
```bash
# Use homelab-manager.sh for command-line control
./homelab-manager.sh
# Option 4: Start All Services
# Option 5: Stop All Services
```

#### Viewing Service Logs

**Real-time logs in dashboard:**
1. Services tab → Select service
2. Click "View Logs" 📋
3. Logs stream in real-time
4. Use search box to filter

**Advanced log viewing:**
1. Dashboard → Logs Viewer tab
2. Select service from dropdown
3. Set time range (last hour, 24 hours, 7 days)
4. Apply filters (ERROR, WARN, INFO)
5. Download logs as file

**Log search features:**
- **Keyword search:** Find specific errors or events
- **Regex support:** Advanced pattern matching
- **Multi-service:** View logs from multiple services
- **Export:** Download logs for external analysis

#### Health Monitoring

**Access:** Dashboard → Health tab

Real-time health metrics:

**Container Health:**
- CPU usage per container
- Memory consumption
- Network I/O
- Disk usage

**System Health:**
- Overall CPU load
- Total memory usage
- Disk space available
- Network throughput

**Database Health:**
- Connection pool status
- Active queries
- Slow query detection
- Database size

**Alerts Configuration:**
1. Health tab → Configure Alerts
2. Set thresholds:
   - CPU > 80% → Alert
   - Memory > 90% → Critical
   - Disk < 10GB → Warning
3. Choose notification method (email, webhook)
4. Save configuration

### Performance Dashboard (Game Streaming)

**Access:** Dashboard → Game Streaming tab

#### Session Management

**Create streaming session:**
1. Click "New Session"
2. Configure settings:
   - **Game:** Select from library
   - **Resolution:** 1080p, 1440p, 4K
   - **FPS:** 30, 60, 120
   - **Encoder:** H.264, H.265, AV1
3. Click "Start Session"

**Active session controls:**
- **Pause/Resume:** Preserve session state
- **Take Screenshot:** Capture current frame
- **Record:** Start/stop recording
- **End Session:** Terminate and cleanup

#### OBS Integration Setup

**Connect OBS:**
1. Open OBS → Tools → WebSocket Server Settings
2. Enable WebSocket server
3. Set password
4. Copy connection details
5. Dashboard → Game Streaming → OBS Settings
6. Paste host, port, password
7. Click "Connect"

**Features after connection:**
- View current scene
- Switch scenes remotely
- Toggle source visibility
- Start/stop streaming
- Start/stop recording

#### Streaming Controls

**Dashboard streaming interface:**
- **Go Live:** Start stream to platform
- **Switch Scene:** Change OBS scene
- **Audio Mixer:** Adjust audio sources
- **Chat Display:** View chat overlay
- **Bitrate Monitor:** Real-time network stats

### Marketplace

**Access:** Dashboard → Marketplace tab

The marketplace provides 15 pre-configured templates for one-click deployments.

#### Browse Templates

**Categories:**
- **Apps** (8): WordPress, Ghost, Nextcloud, n8n, Portainer, Plex, Jellyfin, Code-Server
- **Databases** (4): PostgreSQL, MySQL, MongoDB, Redis
- **Stacks** (3): WordPress+MySQL, Ghost+MySQL, Nextcloud+PostgreSQL

**Filtering:**
- Search by name or keyword
- Filter by category
- Sort by popularity

#### Install Applications

**Installation wizard:**

1. **Select template:**
   - Click app card
   - View details (description, requirements, ports)
   - Click "Install"

2. **Configure variables:**
   ```
   App Name: myblog
   Domain: blog.mydomain.com
   Database Password: [auto-generated]
   Admin Email: admin@mydomain.com
   ```

3. **Review configuration:**
   - Docker Compose preview
   - Port assignments
   - Volume mounts
   - Environment variables

4. **Deploy:**
   - Click "Deploy Now"
   - Monitor progress (pull images, create containers, configure network)
   - Wait for "Deployment Successful"

#### Configure Variables

**Common variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_NAME` | Unique identifier | `myblog` |
| `DOMAIN` | Public URL | `blog.mydomain.com` |
| `DB_PASSWORD` | Database password | Auto-generated |
| `ADMIN_EMAIL` | Administrator email | `admin@example.com` |
| `PORT` | External port | `8080` (auto-assigned) |

**Advanced variables:**
- **Resource Limits:** CPU/memory constraints
- **Replicas:** Number of instances
- **Network Mode:** Bridge, host, none
- **Restart Policy:** Always, unless-stopped, on-failure

#### Manage Deployments

**View all deployments:**
1. Marketplace → "My Deployments" tab
2. See all installed apps

**Per-deployment actions:**

| Action | Description |
|--------|-------------|
| **▶️ Start** | Start stopped deployment |
| **⏸️ Stop** | Stop running deployment |
| **🔄 Restart** | Restart deployment |
| **⚙️ Configure** | Edit environment variables |
| **📊 Logs** | View container logs |
| **🗑️ Uninstall** | Remove deployment completely |

**Deployment info:**
- Status (running, stopped, error)
- Uptime
- Resource usage (CPU, RAM)
- Public URL
- Container ID
- Created date

### Logs Viewer

**Access:** Dashboard → Logs tab

#### Real-time Log Streaming

**Live tail mode:**
1. Select service(s)
2. Click "Start Live Tail" 📡
3. Logs appear in real-time
4. Auto-scroll to bottom (toggle available)
5. Click "Stop Live Tail" to pause

**Log levels:**
- **DEBUG** 🔍: Detailed diagnostic information
- **INFO** ℹ️: General informational messages
- **WARN** ⚠️: Warning messages (non-critical)
- **ERROR** ❌: Error messages (requires attention)
- **CRITICAL** 🔥: Critical failures

#### Search and Filtering

**Basic search:**
```
Search: "error"
Results: All logs containing "error" (case-insensitive)
```

**Advanced filters:**
- **Time range:** Last hour, 24h, 7 days, custom
- **Log level:** DEBUG, INFO, WARN, ERROR, CRITICAL
- **Service:** Single or multiple services
- **Regular expressions:** `/pattern/` for complex matching

**Search examples:**
```
"database connection" → Find database issues
/ERROR.*timeout/ → Regex for timeout errors
level:ERROR service:stream-bot → Errors from Stream Bot only
```

#### Download Logs

**Export options:**
1. Click "Export" button
2. Choose format:
   - **Text (.txt):** Plain text
   - **JSON (.json):** Structured data
   - **CSV (.csv):** Spreadsheet compatible
3. Select time range
4. Click "Download"

### Settings

**Access:** Dashboard → Settings tab

#### Domain Configuration

**Manage service domains:**
1. Settings → Domains
2. View current mappings:
   ```
   dashboard.yourdomain.com → homelab-dashboard:5000
   stream.yourdomain.com → stream-bot:3000
   ```
3. Add new domain:
   - Domain name
   - Target service
   - Port (if custom)
4. Caddy auto-configures SSL

#### Integration Management

**Connected integrations:**
- OpenAI (Jarvis AI)
- Twitch (Stream Bot)
- YouTube (Stream Bot)
- Discord (Discord Bot)
- Spotify (Music integration)
- Home Assistant (Smart home)

**Manage integration:**
1. Settings → Integrations
2. Click integration card
3. View status, test connection
4. Reconfigure credentials if needed
5. Disconnect/reconnect

#### User Preferences

**Customization options:**
- **Theme:** Light, Dark, Auto (system)
- **Dashboard Layout:** Compact, Comfortable, Spacious
- **Notifications:** Email, Push, None
- **Language:** English (more coming)
- **Timezone:** Auto-detect or manual

---

## 🤖 Stream Bot

**Access:** `https://stream.yourdomain.com`

Multi-platform streaming bot supporting Twitch, YouTube, and Kick.

### OAuth Setup

**Connect your accounts for bot functionality.**

#### Connect Twitch Account

1. Stream Bot → Settings → Platforms
2. Click "Connect Twitch" 🟣
3. Redirect to Twitch OAuth
4. Authorize application (read messages, send messages, manage channel)
5. Redirect back to Stream Bot
6. ✅ "Twitch Connected"

**Required Twitch Scopes:**
- `chat:read` - Read chat messages
- `chat:edit` - Send chat messages
- `channel:moderate` - Moderate chat
- `channel:manage:broadcast` - Update stream info

#### Connect YouTube Account

1. Stream Bot → Settings → Platforms
2. Click "Connect YouTube" 🔴
3. Google OAuth consent screen
4. Select account
5. Grant permissions:
   - View live streams
   - Manage live chats
   - Read channel data
6. ✅ "YouTube Connected"

#### Connect Kick Account

1. Stream Bot → Settings → Platforms
2. Click "Connect Kick" 🟢
3. Kick OAuth
4. Authorize Stream Bot
5. ✅ "Kick Connected"

#### Connect Spotify Account

1. Stream Bot → Settings → Integrations
2. Click "Connect Spotify" 🟢
3. Spotify OAuth
4. Authorize (read currently playing, control playback)
5. ✅ "Spotify Connected"

**Spotify features:**
- Display current song
- Song requests from chat
- Skip song command
- Playlist management

### Dashboard Overview

**Main dashboard shows:**

#### Bot Status

- **🟢 Online:** Bot connected and listening
- **🟡 Starting:** Bot initializing
- **🔴 Offline:** Bot disconnected
- **⚠️ Error:** Connection issue

#### Platform Connections

```
Twitch:   ✅ Connected (streaming)
YouTube:  ✅ Connected (not streaming)
Kick:     ❌ Not connected
Spotify:  ✅ Connected
```

#### Quick Actions

| Action | Description |
|--------|-------------|
| **Start Bot** | Connect to all platforms |
| **Stop Bot** | Disconnect gracefully |
| **Restart Bot** | Reconnect to fix issues |
| **Test Command** | Verify bot responds in chat |

### Analytics Dashboard

**Access:** Stream Bot → Analytics tab

Comprehensive streaming analytics across all platforms.

#### Viewer Metrics

**Real-time stats:**
- **Current Viewers:** Live viewer count
- **Peak Viewers:** Highest concurrent viewers
- **Average Viewers:** Mean across stream
- **Unique Chatters:** Distinct users in chat

**Historical charts:**
- Viewer count over time (line graph)
- Chat activity heatmap
- Platform breakdown (pie chart)
- Growth trends (week over week)

#### Follower Growth

**Metrics:**
- New followers today/week/month
- Total follower count
- Follow rate (followers per stream)
- Conversion rate (viewer → follower)

**Graphs:**
- Follower growth timeline
- Platform comparison
- Prediction (AI-powered forecast)

#### Sentiment Analysis

**AI-powered chat sentiment:**
- **Positive:** 😊 65%
- **Neutral:** 😐 30%
- **Negative:** 😞 5%

**Sentiment timeline:**
- Track mood changes during stream
- Identify popular moments (sentiment spikes)
- Compare across streams

**Word cloud:**
- Most used words in chat
- Trending phrases
- Emote usage stats

#### Health Scoring

**Stream health score (0-100):**

Calculated from:
- Viewer engagement (chat activity)
- Follower growth rate
- Stream uptime/stability
- Audio/video quality
- Chat moderation effectiveness

**Recommendations:**
```
Score: 87/100 (Good) 🟢

Strengths:
✅ High chat engagement
✅ Stable stream quality
✅ Good follower growth

Improvements:
⚠️ Increase stream frequency
⚠️ Optimize peak streaming times
```

#### Export Data

**Export analytics:**
1. Analytics → Export
2. Select date range
3. Choose format:
   - CSV (Excel/Sheets)
   - JSON (programmatic access)
   - PDF (report)
4. Download

**Included data:**
- Viewer stats
- Follower growth
- Chat logs
- Sentiment analysis
- Revenue (if configured)

### AI Moderation

**Access:** Stream Bot → Moderation tab

AI-powered chat moderation with customizable rules.

#### Configure Moderation Rules

**Rule types available:**

##### 1. Toxic Language Detection

**Settings:**
- **Enabled:** ✅ Yes / ❌ No
- **Sensitivity:** Low, Medium, High, Very High
- **Action:** Delete, Timeout, Ban
- **Timeout Duration:** 60s, 300s, 600s

**Examples detected:**
- Hate speech
- Offensive slurs
- Harassment

##### 2. Spam Filtering

**Spam types:**
- **Repeated Messages:** Same message 3+ times
- **Fast Messages:** >5 messages in 10 seconds
- **Link Spam:** Unauthorized URLs
- **Emote Spam:** >10 emotes in message

**Actions:**
```
First offense: Delete message
Second offense: 60 second timeout
Third offense: 10 minute timeout
Fourth offense: Ban
```

##### 3. Link Blocking

**Options:**
- **Block all links:** ✅/❌
- **Allow for subscribers:** ✅/❌
- **Allow for moderators:** ✅/❌
- **Whitelist domains:**
  ```
  twitch.tv
  youtube.com
  yourdomain.com
  ```

##### 4. Caps Lock Enforcement

**Settings:**
- **Max caps %:** 70%
- **Min message length:** 10 characters
- **Action:** Delete / Warn

**Example:**
```
❌ "HELLO EVERYONE!!!" → Deleted (100% caps)
✅ "Hello EVERYONE!" → Allowed (55% caps)
```

##### 5. Symbol Spam Detection

**Block excessive symbols:**
```
❌ "!!!!!!!!!!!!" → Deleted
❌ "??????????????" → Deleted
✅ "Really?!!" → Allowed (reasonable)
```

**Settings:**
- Max consecutive symbols: 3
- Max total symbols: 30% of message

#### Set Auto-Actions

**Action types:**

| Action | Description | Use Case |
|--------|-------------|----------|
| **Delete** | Remove message only | Minor violations |
| **Timeout** | Temporary chat ban | Repeated violations |
| **Ban** | Permanent chat ban | Severe violations |
| **Warn** | Send warning DM | First-time offenders |

**Escalation system:**
```
Violation 1: Warn + Delete
Violation 2: 60s Timeout
Violation 3: 10m Timeout
Violation 4: 1h Timeout
Violation 5: Permanent Ban
```

#### Rule Severity Levels

**Configure per-rule:**

**Low Severity:**
- Action: Delete message
- No timeout
- Example: Mild caps lock

**Medium Severity:**
- Action: Delete + 60s timeout
- Warning to user
- Example: Link spam

**High Severity:**
- Action: Delete + 10m timeout
- Logged for review
- Example: Repeated spam

**Critical Severity:**
- Action: Immediate ban
- Notification to mods
- Example: Hate speech

#### Platform-Specific Rules

**Configure separately for each platform:**

```
Twitch Rules:
  - Emote spam: High sensitivity
  - Link blocking: Enabled
  
YouTube Rules:
  - Toxic language: Very High
  - Spam: Medium
  
Kick Rules:
  - Link blocking: Disabled (for now)
  - Caps: Low sensitivity
```

### Giveaway System

**Access:** Stream Bot → Giveaways tab

Cryptographically secure giveaway system.

#### Create Giveaway

**Setup wizard:**

1. **Basic Info:**
   ```
   Title: "New Keyboard Giveaway"
   Description: "Win a custom mechanical keyboard!"
   Prize Value: $150
   ```

2. **Entry Method:**
   - **Chat command:** `!enter` or `!giveaway`
   - **Keyword:** Auto-enter on keyword in chat
   - **Automatic:** All chatters auto-entered

3. **Eligibility:**
   - ✅ Subscribers only
   - ✅ Followers (min 30 days)
   - ✅ Account age (min 6 months)
   - ❌ Previously won (exclude repeat winners)

4. **Duration:**
   - Start: Now / Scheduled
   - Duration: 30 minutes, 1 hour, 2 hours, custom
   - End: Auto / Manual

#### Configure Duration

**Time options:**
- **Fixed duration:** 1 hour from start
- **Viewer threshold:** 100 entries
- **Manual end:** Streamer decides

**During giveaway:**
```
🎁 GIVEAWAY ACTIVE
Entries: 142
Time Remaining: 23:45
Command: !enter
```

#### Select Winner

**Selection methods:**

**Random (Cryptographically Secure):**
- Uses Web Crypto API
- Provably fair
- All entries have equal chance

**Weighted (Subscriber Priority):**
```
Regular viewer: 1 ticket
Subscriber: 3 tickets
Top donor: 5 tickets
```

**Manual Selection:**
- Choose from entry list
- Good for subjective contests

**Winner announcement:**
1. Click "Select Winner"
2. Spinning animation (suspense!)
3. Winner revealed
4. Auto-announced in chat:
   ```
   🎉 Congratulations @username! You won the keyboard giveaway! 
   Please check your DMs for claim instructions.
   ```

#### Announce Winner

**Announcement options:**
- **In chat:** Public announcement
- **DM winner:** Private instructions
- **Both:** Public + private notification

**Winner notification includes:**
- Prize details
- Claim instructions
- Deadline to claim (7 days)
- Contact information

**If winner doesn't respond:**
- Auto-redraw after 48 hours
- Select runner-up

### OBS Control

**Access:** Stream Bot → OBS tab

Remote control OBS without leaving browser.

#### Connect OBS WebSocket

**Setup:**

1. **Install OBS WebSocket plugin:**
   - OBS 28+: Built-in
   - OBS <28: Install from obs-websocket.com

2. **Configure OBS:**
   - Tools → WebSocket Server Settings
   - Enable WebSocket server
   - Server Port: 4455
   - Set password: `your_secure_password`

3. **Connect from Stream Bot:**
   - OBS tab → Connection Settings
   - Host: `localhost` (if same machine) or IP
   - Port: `4455`
   - Password: `your_secure_password`
   - Click "Connect"

**Connection status:**
```
✅ Connected to OBS Studio
Version: 29.0.2
WebSocket: 5.0.1
```

#### Scene Switching

**Remote scene control:**

**View current scene:**
```
Current Scene: 🎮 Gaming
Available Scenes:
  - Starting Soon
  - 🎮 Gaming
  - Just Chatting
  - BRB
  - Ending Soon
```

**Switch scene:**
1. Click scene name
2. Instant transition in OBS
3. Confirmation in UI

**Keyboard shortcuts:**
```
1 = Starting Soon
2 = Gaming
3 = Just Chatting
4 = BRB
5 = Ending Soon
```

#### Source Visibility Control

**Toggle sources remotely:**

**Gaming Scene Sources:**
```
🟢 Game Capture (visible)
🟢 Webcam (visible)
🟢 Alert Box (visible)
🔴 BRB Screen (hidden)
🟢 Chat Overlay (visible)
```

**Quick toggles:**
- Webcam on/off
- Alerts on/off
- Chat overlay on/off
- Music visualizer on/off

#### Automation Rules

**Event-based triggers:**

**Example automations:**

1. **Follower Alert → Show Alert Source**
   ```
   Trigger: New follower
   Action: Show "Alert Box" for 5 seconds
   Sound: follower_sound.mp3
   ```

2. **Raid → Switch Scene**
   ```
   Trigger: Incoming raid
   Action: Switch to "Raid Incoming" scene
   Duration: 60 seconds
   Then: Return to previous scene
   ```

3. **Donation → Flash Border**
   ```
   Trigger: Donation received
   Action: Show colored border source
   Color: Based on amount ($5=Blue, $10=Gold)
   Duration: 10 seconds
   ```

4. **Stream Start → Enable Recording**
   ```
   Trigger: Stream goes live
   Action: Start OBS recording
   Auto-stop: When stream ends
   ```

**Create automation:**
1. OBS tab → Automations
2. Click "New Automation"
3. Select trigger event
4. Choose action
5. Configure parameters
6. Test automation
7. Save and enable

### Custom Commands

**Access:** Stream Bot → Commands tab

Create custom chat commands with variables and logic.

#### Create Commands

**Command builder:**

**Example: !socials command**
```
Trigger: !socials
Response: "Follow me on Twitter @handle | Join Discord: discord.gg/invite"
Cooldown: 30 seconds
Permission: Everyone
```

**Example: !uptime command**
```
Trigger: !uptime
Response: "Stream has been live for {uptime}"
Cooldown: 10 seconds
Permission: Everyone
```

**Example: !hug command**
```
Trigger: !hug
Response: "{user} gives {target} a big hug! 🤗"
Cooldown: 5 seconds
Permission: Everyone
```

#### Variable Substitution

**Available variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `{user}` | Command sender | `TwitchUser123` |
| `{target}` | Mentioned user (@username) | `StreamerName` |
| `{uptime}` | Stream uptime | `2h 34m` |
| `{game}` | Current game | `Minecraft` |
| `{viewers}` | Current viewers | `142` |
| `{followers}` | Total followers | `1,523` |
| `{count}` | Command use count | `47` |
| `{random:1-100}` | Random number | `73` |

**Advanced variables:**
```
{if:subscriber}You're a sub!{else}Subscribe for perks!{endif}
{api:https://api.example.com/quote}
{counter:deaths}
{time:America/New_York}
```

#### Cooldowns and Permissions

**Cooldown types:**

**Global cooldown:**
- Command usable once per X seconds
- Applies to all users

**Per-user cooldown:**
- Each user can use once per X seconds
- Independent timers

**Example:**
```
!joke command
Global: 30s (prevents spam in chat)
Per-user: 60s (each user once per minute)
```

**Permission levels:**

| Level | Who Can Use |
|-------|-------------|
| **Everyone** | All viewers |
| **Subscriber** | Subscribers only |
| **VIP** | VIPs and above |
| **Moderator** | Mods and broadcaster |
| **Broadcaster** | Broadcaster only |

#### Command Testing

**Test before enabling:**

1. Commands → Select command
2. Click "Test Command"
3. Enter test input:
   ```
   User: TestUser
   Message: !hug @Streamer
   ```
4. View output:
   ```
   TestUser gives Streamer a big hug! 🤗
   ```
5. Verify variables work correctly
6. Adjust as needed
7. Enable command

### Bot Settings

**Access:** Stream Bot → Settings tab

#### Interval Settings

**Message intervals:**
```
Reminder interval: Every 10 minutes
Minimum chat messages: 5 (before auto-message)
```

**Auto-messages:**
- Discord link every 10 minutes
- !commands reminder every 15 minutes
- Subscribe reminder every 20 minutes

#### Chat Settings

**Behavior:**
- **Chat language:** English
- **Reply method:** Reply (with @mention) / Say (without)
- **Command prefix:** `!` (default)
- **Case sensitive:** ❌ No

**Rate limiting:**
- Max messages per second: 20
- Max messages per 30 seconds: 100
- (Prevents Twitch rate limit ban)

#### Alert Configuration

**Alert types:**

**Follow alert:**
```
Enabled: ✅
Message: "Thanks for the follow, {user}! 🎉"
Sound: follow_sound.mp3
Display: 5 seconds
```

**Subscribe alert:**
```
Enabled: ✅
Message: "Welcome to the family, {user}! 💜"
Sound: sub_sound.mp3
Display: 8 seconds
```

**Raid alert:**
```
Enabled: ✅
Message: "RAID! Welcome {raider} and {viewers} viewers! 🎊"
Sound: raid_sound.mp3
Display: 10 seconds
Switch scene: Raid Incoming
```

---

## 🎫 Discord Ticket Bot

**Access:** `https://bot.yourdomain.com`

Support ticket system for Discord servers.

### Setup and Configuration

**Initial setup:**

1. **Invite bot to server:**
   - Dashboard → Get Invite Link
   - Select your Discord server
   - Grant permissions:
     - Manage Channels
     - Send Messages
     - Embed Links
     - Manage Messages

2. **Configure ticket channel:**
   ```
   /setup channel:#support
   ```

3. **Set staff role:**
   ```
   /setup staffrole:@Support Team
   ```

**Panel setup:**
```
/panel create
Title: "Need Help?"
Description: "Click button below to open support ticket"
Button: "🎫 Create Ticket"
Category: Support Tickets
```

### Ticket System Usage

**User creates ticket:**

1. User clicks "🎫 Create Ticket" button
2. New private channel created: `ticket-0042`
3. Permissions:
   - User: Read, Write
   - Support Team: Read, Write
   - Everyone else: No access

**Ticket interface:**
```
🎫 Support Ticket #42

Created by: @User#1234
Created at: Nov 19, 2025 3:42 PM
Status: 🟢 Open

[Claim Ticket] [Close Ticket] [Add User] [Archive]
```

**Support workflow:**

1. **Staff claims ticket:**
   ```
   @Moderator clicked [Claim Ticket]
   Status: 🟡 In Progress
   Assigned: @Moderator
   ```

2. **Staff helps user:**
   - Live chat in ticket channel
   - Attach files/screenshots
   - Tag other staff if needed

3. **Resolution:**
   ```
   /close reason:Issue resolved, account unlocked
   ```

4. **Archive:**
   - Channel deleted
   - Transcript saved
   - Notification sent to user

### Streamer Notifications

**Go-live announcements:**

**Setup:**
```
/notify channel:#announcements
/notify role:@Streamer Alerts
/notify message:@everyone {streamer} is now LIVE! {title} - {game}
/notify add:YourTwitchUsername
```

**Notification example:**
```
@everyone 🔴 LIVE NOW!

Streamer is now live on Twitch!

Title: "Minecraft Monday - Building the Mega Base!"
Game: Minecraft
Viewers: 142

[Watch Now](https://twitch.tv/streamer)
```

**Supported platforms:**
- Twitch
- YouTube
- Kick
- Facebook Gaming (if configured)

---

## 🏠 Smart Home Integration

**Access:** Via Nebula Dashboard or Home Assistant URL

### Integration Setup

**Connect Home Assistant to Dashboard:**

1. **Get Home Assistant token:**
   - Home Assistant → Profile
   - Long-Lived Access Tokens
   - Create new token: "Nebula Command"
   - Copy token

2. **Configure in Dashboard:**
   - Settings → Integrations → Home Assistant
   - URL: `http://homeassistant:8123`
   - Token: Paste token
   - Verify SSL: Disabled (internal network)
   - Test Connection → ✅ Success

### Device Control

**From Nebula Dashboard:**

**View devices:**
```
Smart Home tab → Devices

Living Room
  💡 Ceiling Light (on)
  🌡️ Thermostat (72°F)
  📺 TV (off)

Bedroom
  💡 Bedside Lamp (off)
  🌡️ Temperature Sensor (68°F)
```

**Control device:**
1. Click device card
2. Toggle or adjust
3. Change syncs instantly

**Voice control with Jarvis:**
```
"Turn on living room lights"
"Set thermostat to 70 degrees"
"Turn off all lights"
```

### Automation Triggers

**Create automations:**

**Example: Stream Start → Lights**
```
Trigger: Stream Bot goes live
Action: Set living room lights to blue
Brightness: 50%
```

**Example: Night Mode**
```
Trigger: 10:00 PM
Action:
  - Turn off all lights except bedroom
  - Set bedroom dim (20%)
  - Lock doors
  - Arm security system
```

**Example: Morning Routine**
```
Trigger: 7:00 AM weekdays
Action:
  - Gradually brighten bedroom lights
  - Start coffee maker
  - Read morning news (TTS)
  - Display weather on dashboard
```

---

## 💡 Tips & Best Practices

### Performance Optimization

**Keep services healthy:**
- Monitor resource usage regularly
- Restart heavy services weekly
- Clear logs monthly
- Update Docker images quarterly

**Database maintenance:**
```bash
# Run from homelab-manager
./homelab-manager.sh → Option 22 (Fix Database Migrations)
```

**Docker cleanup:**
```bash
# Remove unused images/containers
docker system prune -af
```

### Security Best Practices

**Access control:**
- Use VPN (Twingate) for remote access
- Enable 2FA on all OAuth platforms
- Rotate API keys quarterly
- Use strong passwords (password manager)

**Backup strategy:**
- Backup `.env` file (encrypted)
- Export database regularly
- Save critical configurations
- Test restore procedures

**Monitoring:**
- Enable health check alerts
- Review logs weekly
- Monitor failed login attempts
- Track unusual resource usage

### Troubleshooting Tips

**Service won't start:**
1. Check logs: Dashboard → Logs → Select service
2. Verify .env variables
3. Test database connectivity
4. Restart dependencies (Redis, PostgreSQL)

**OAuth failing:**
1. Verify redirect URIs match exactly
2. Check client ID/secret
3. Clear browser cookies
4. Try different browser

**High resource usage:**
1. Identify culprit: Dashboard → Health tab
2. Check for memory leaks in logs
3. Restart service
4. Reduce worker count if needed

### Getting Help

**Documentation:**
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Setup instructions
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - API reference
- [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Common issues

**Support channels:**
- GitHub Issues - Bug reports
- Discord - Community help
- Email - Direct support

---

**Last Updated:** November 2025  
**Version:** 2.0  
**Platform:** Nebula Command AI Homelab
