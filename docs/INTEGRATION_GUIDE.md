# Integration Guide for Critical Improvements

**IMPORTANT:** These changes must be integrated carefully to avoid breaking production.

---

## 🎫 Part 1: Discord Bot - Ticket Channel Manager Integration

### Step 1: Update `bot.ts` to Initialize TicketChannelManager

**File:** `services/discord-bot/server/discord/bot.ts`

Add import at top of file (after existing imports):
```typescript
import { TicketChannelManager, startThreadCleanupJob } from './ticket-channel-manager';
```

Add after `const channelToTicketMap` declaration (around line 34):
```typescript
// Ticket channel manager for organized ticket threading
let ticketChannelManager: TicketChannelManager | null = null;
let threadCleanupJobInterval: NodeJS.Timeout | null = null;
```

Add to `startBot()` function after client is created (around line 75):
```typescript
    // Initialize ticket channel manager after bot is ready
    client.once(Events.ClientReady, async () => {
      console.log('[Discord] Bot is ready! Initializing ticket channel manager...');
      
      const guilds = client.guilds.cache;
      if (guilds.size > 0) {
        // Initialize for each guild
        for (const [guildId, guild] of guilds) {
          ticketChannelManager = new TicketChannelManager({
            serverId: guildId,
            client,
            storage,
          });
          
          // Start daily cleanup job
          if (!threadCleanupJobInterval) {
            threadCleanupJobInterval = startThreadCleanupJob(ticketChannelManager);
          }
          
          console.log(`[Discord] ✅ Ticket channel manager initialized for guild: ${guild.name}`);
        }
      } else {
        console.warn('[Discord] No guilds found - ticket channel manager not initialized');
      }
    });
```

### Step 2: Update `ticket-threads.ts` to Use Channel Manager

**File:** `services/discord-bot/server/discord/ticket-threads.ts`

Replace the entire `createTicketThread` function with:
```typescript
export async function createTicketThread(options: CreateTicketThreadOptions): Promise<string | null> {
  const { storage, client, ticket, category, serverId, creatorDiscordId, creatorUsername, channelToTicketMap } = options;
  
  try {
    // Use TicketChannelManager for organized channel creation
    const { TicketChannelManager } = await import('./ticket-channel-manager.js');
    const channelManager = new TicketChannelManager({
      serverId,
      client,
      storage,
    });
    
    // Create thread using channel manager (handles category/channel organization)
    const threadId = await channelManager.createTicketThread(
      ticket,
      category,
      creatorDiscordId,
      creatorUsername
    );
    
    if (!threadId) {
      console.error('[Ticket Thread] Failed to create thread using channel manager');
      return null;
    }
    
    // Get the thread and add comprehensive embed and action buttons
    const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const guild = client.guilds.cache.get(serverId);
    
    if (!guild) {
      console.error('[Ticket Thread] Guild not found');
      return null;
    }
    
    const ticketThread = await client.channels.fetch(threadId);
    if (!ticketThread || !('send' in ticketThread)) {
      console.error('[Ticket Thread] Thread not found or invalid');
      return null;
    }
    
    // Add ticket creator to thread
    try {
      await (ticketThread as any).members.add(creatorDiscordId);
    } catch (err) {
      console.log(`[Ticket Thread] Creator already in thread or permission issue`);
    }
    
    // Add support and staff roles to the thread
    try {
      const settings = await storage.getBotSettings(serverId);
      
      if (settings) {
        const rolesToAdd = [];
        
        if (settings.supportRoleId) {
          rolesToAdd.push(settings.supportRoleId);
        }
        if (settings.adminRoleId) {
          rolesToAdd.push(settings.adminRoleId);
        }
        
        for (const roleId of rolesToAdd) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            const membersWithRole = role.members;
            console.log(`[Ticket Thread] Adding ${membersWithRole.size} members from role ${role.name} to thread`);
            
            for (const [memberId, member] of membersWithRole) {
              try {
                await (ticketThread as any).members.add(memberId);
              } catch (memberErr) {
                console.log(`[Ticket Thread] Could not add member ${member.user.username} to thread:`, memberErr instanceof Error ? memberErr.message : 'Unknown error');
              }
            }
          }
        }
      }
    } catch (roleErr) {
      console.error(`[Ticket Thread] Failed to add support/staff roles:`, roleErr);
    }
    
    // Create ticket embed
    const categoryName = category ? category.name : 'Unknown Category';
    const categoryEmoji = category?.emoji || '🎫';
    const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
    
    const getPriorityDisplay = (priority: string) => {
      switch (priority) {
        case 'urgent': return '🔴 Urgent';
        case 'high': return '🟠 High';
        case 'normal': return '🟢 Normal';
        case 'low': return '🔵 Low';
        default: return '🟢 Normal';
      }
    };
    
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticket.id}`)
      .setDescription(`**${ticket.title}**\n\n${ticket.description}`)
      .addFields(
        { name: 'Created By', value: `<@${creatorDiscordId}>`, inline: true },
        { name: 'Status', value: '✅ Open', inline: true },
        { name: 'Priority', value: getPriorityDisplay(ticket.priority || 'normal'), inline: true },
        { name: 'Category', value: `${categoryEmoji} ${categoryName}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setColor(ticket.priority === 'urgent' ? '#ED4245' : '#5865F2')
      .setFooter({ text: 'Support Team • Reply in this thread for assistance' })
      .setTimestamp();
    
    // Create action buttons
    const staffActions = new ActionRowBuilder<any>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_assign_${ticket.id}`)
          .setLabel('Assign to Me')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✋'),
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticket.id}`)
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId(`ticket_pending_${ticket.id}`)
          .setLabel('Mark Pending')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏸️'),
        new ButtonBuilder()
          .setCustomId(`ticket_ban_${ticket.id}`)
          .setLabel('Ban User')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔨')
      );
    
    const staffActions2 = new ActionRowBuilder<any>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_warn_${ticket.id}`)
          .setLabel('Warn User')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setLabel('View Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${baseUrl}?ticket=${ticket.id}`)
          .setEmoji('🔗')
      );
    
    await (ticketThread as any).send({
      content: `<@${creatorDiscordId}> Your ticket has been created! Our support team has been notified and will assist you shortly.`,
      embeds: [ticketEmbed],
      components: [staffActions, staffActions2]
    });
    
    // Update ticket with thread ID
    await storage.updateTicket(ticket.id, { discordId: threadId });
    
    // Update channelToTicketMap for message sync
    channelToTicketMap.set(threadId, ticket.id);
    
    console.log(`[Ticket Thread] ✅ Thread created successfully with comprehensive embed and action buttons`);
    
    return threadId;
  } catch (error) {
    console.error('[Ticket Thread] Failed to create thread for ticket:', error);
    return null;
  }
}
```

### Step 3: Add Cleanup on Bot Shutdown

**File:** `services/discord-bot/server/discord/bot.ts`

Add to the end of file (after `startBot` function):
```typescript
/**
 * Cleanup function to stop all background jobs
 * Call this on graceful shutdown
 */
export function stopBot(): void {
  console.log('[Discord] Stopping bot and cleaning up background jobs...');
  
  // Clear ticket mapping refresh interval
  if (ticketMappingRefreshInterval) {
    clearInterval(ticketMappingRefreshInterval);
    ticketMappingRefreshInterval = null;
  }
  
  // Clear auto-detection scan interval
  if (autoDetectionScanInterval) {
    clearInterval(autoDetectionScanInterval);
    autoDetectionScanInterval = null;
  }
  
  // Clear thread cleanup job
  if (threadCleanupJobInterval) {
    clearInterval(threadCleanupJobInterval);
    threadCleanupJobInterval = null;
  }
  
  // Disconnect client
  if (client) {
    client.destroy();
    client = null;
  }
  
  console.log('[Discord] ✅ Bot stopped and all background jobs cleared');
}
```

---

## 🔐 Part 2: Stream Bot - OAuth Database Storage Integration

### Step 1: Run Database Migration

**CRITICAL:** Run this migration in staging first, then production

```bash
# Staging database
psql "postgresql://streambot:<password>@<staging-host>:5432/streambot" -f services/stream-bot/migrations/0005_add_oauth_sessions.sql

# Verify migration
psql "postgresql://streambot:<password>@<staging-host>:5432/streambot" -c "SELECT COUNT(*) FROM oauth_sessions;"

# Production database (after testing)
psql "postgresql://streambot:<password>@<production-host>:5432/streambot" -f services/stream-bot/migrations/0005_add_oauth_sessions.sql
```

### Step 2: Update OAuth Routes to Use Database Storage

**File:** `services/stream-bot/server/oauth-twitch.ts`

Replace import:
```typescript
// OLD:
import { oauthStorage } from "./oauth-storage";

// NEW:
import { oauthStorageDB } from "./oauth-storage-db";
```

Replace all `oauthStorage.set()` calls:
```typescript
// OLD:
oauthStorage.set(state, {
  userId: req.user!.id,
  platform: 'twitch',
  codeVerifier,
});

// NEW:
await oauthStorageDB.set(state, {
  userId: req.user!.id,
  platform: 'twitch',
  codeVerifier,
  ipAddress: req.ip || req.socket.remoteAddress,
});
```

Replace all `oauthStorage.get()` calls:
```typescript
// OLD:
const session = oauthStorage.get(state);

// NEW:
const session = await oauthStorageDB.get(state);
```

**File:** `services/stream-bot/server/oauth-youtube.ts`

Apply same changes as oauth-twitch.ts

**File:** `services/stream-bot/server/auth/passport-oauth-config.ts`

If it uses oauthStorage, apply same changes

### Step 3: Start Cleanup Job

**File:** `services/stream-bot/server/index.ts`

Add import:
```typescript
import { startOAuthCleanupJob } from "./oauth-storage-db";
```

Add after server starts (around where tokenRefreshService starts):
```typescript
// Start OAuth session cleanup job
startOAuthCleanupJob();
console.log('[Server] OAuth session cleanup job started');
```

### Step 4: Optional - Add Monitoring

**File:** `services/stream-bot/server/routes.ts`

Add monitoring endpoint:
```typescript
// OAuth session statistics (admin only)
router.get('/admin/oauth-stats', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { oauthStorageDB } = await import('./oauth-storage-db');
    const stats = await oauthStorageDB.getStats();
    
    res.json(stats);
  } catch (error: any) {
    console.error('[OAuth Stats] Error:', error);
    res.status(500).json({ error: 'Failed to get OAuth stats' });
  }
});
```

---

## 🧪 Testing Checklist

### Discord Bot Testing

**Test 1: Ticket Thread Creation**
- [ ] Create a new ticket via Discord bot
- [ ] Verify thread is created in correct category channel (not admin channel)
- [ ] Verify thread has proper name format: "🎫 Ticket #123: Title"
- [ ] Verify ticket creator is added to thread
- [ ] Verify support roles are added to thread

**Test 2: Category Organization**
- [ ] Create tickets of different categories
- [ ] Verify each category has its own channel (e.g., #general-support, #bug-reports)
- [ ] Verify channels are in "🎫 Active Tickets" category
- [ ] Verify thread counts don't exceed Discord limits

**Test 3: Thread Archival**
- [ ] Close a ticket from dashboard or Discord
- [ ] Verify thread is archived
- [ ] Verify thread is locked
- [ ] Verify thread status syncs between Discord and dashboard

**Test 4: Cleanup Job**
- [ ] Create old test tickets and manually set archive timestamp
- [ ] Trigger cleanup job manually: `ticketChannelManager.cleanupOldArchivedThreads(1)` (1 day old)
- [ ] Verify old threads are deleted
- [ ] Verify cleanup doesn't affect active threads

### Stream Bot OAuth Testing

**Test 1: OAuth Session Creation**
- [ ] Start Twitch OAuth flow
- [ ] Verify session is created in oauth_sessions table
- [ ] Verify expires_at is 10 minutes in future
- [ ] Verify used_at is null

**Test 2: OAuth Callback (Happy Path)**
- [ ] Complete Twitch OAuth flow
- [ ] Verify session is consumed (used_at set)
- [ ] Verify access token is encrypted and stored in platform_connections
- [ ] Verify user can start bot

**Test 3: Replay Attack Prevention**
- [ ] Complete OAuth flow once (success)
- [ ] Try to reuse same callback URL/state (should fail)
- [ ] Verify error is logged as "OAuth session already used"
- [ ] Verify no second token is issued

**Test 4: State Expiration**
- [ ] Start OAuth flow
- [ ] Wait 11 minutes (beyond expiration)
- [ ] Try to complete callback (should fail)
- [ ] Verify error is "OAuth session expired"

**Test 5: Cleanup Job**
- [ ] Create expired/used test sessions
- [ ] Trigger cleanup: `oauthStorageDB.cleanupExpired()`
- [ ] Verify expired sessions are deleted
- [ ] Verify active sessions remain

**Test 6: Concurrent OAuth (Race Condition Test)**
- [ ] Start OAuth flow
- [ ] Get callback URL with state
- [ ] Make TWO simultaneous requests to callback URL (simulate race condition)
- [ ] Verify only ONE succeeds
- [ ] Verify second request gets "already used" error

---

## 🔄 Deployment Plan

### Phase 1: Pre-Deployment (Staging)

**Day 1-2: Staging Deployment**
1. Deploy to staging environment
2. Run all integration tests
3. Load test with 100+ concurrent OAuth requests
4. Monitor for 24 hours
5. Fix any issues found

**Checklist:**
- [ ] Staging database migration completed
- [ ] All integration tests pass
- [ ] No errors in logs for 24 hours
- [ ] OAuth flows work for Twitch, YouTube, Kick
- [ ] Discord ticket creation creates organized channels
- [ ] Thread cleanup runs successfully

### Phase 2: Production Deployment

**Day 3: Production Database Prep**
1. **Create database backup:**
   ```bash
   pg_dump "postgresql://streambot:<password>@discord-bot-db:5432/streambot" > streambot_backup_$(date +%Y%m%d).sql
   ```
2. **Run migration:**
   ```bash
   psql "postgresql://streambot:<password>@discord-bot-db:5432/streambot" -f services/stream-bot/migrations/0005_add_oauth_sessions.sql
   ```
3. **Verify:**
   ```bash
   psql "postgresql://streambot:<password>@discord-bot-db:5432/streambot" -c "\d oauth_sessions"
   ```

**Day 3: Code Deployment**
1. **Maintenance window:** 2 AM - 4 AM (low traffic)
2. **Stop services:**
   ```bash
   docker-compose stop discord-bot stream-bot
   ```
3. **Pull new code:**
   ```bash
   git pull origin main
   ```
4. **Rebuild containers:**
   ```bash
   docker-compose build discord-bot stream-bot
   ```
5. **Start services:**
   ```bash
   docker-compose up -d discord-bot stream-bot
   ```
6. **Monitor logs:**
   ```bash
   docker-compose logs -f discord-bot stream-bot
   ```

**Post-Deployment Verification (30 minutes):**
- [ ] All services started successfully
- [ ] No errors in logs
- [ ] Health checks passing
- [ ] Test OAuth flow (Twitch)
- [ ] Test Discord ticket creation
- [ ] Verify database connections
- [ ] Check cleanup jobs running

**Day 4: Monitoring**
- Monitor for 24 hours
- Check error rates
- Verify OAuth success rates
- Check Discord ticket organization

### Phase 3: Rollback Plan (If Needed)

**If Critical Issues Found:**

**Stream Bot Rollback:**
```bash
# 1. Stop service
docker-compose stop stream-bot

# 2. Revert code
git revert <commit-hash>

# 3. Rebuild
docker-compose build stream-bot

# 4. Start service
docker-compose up -d stream-bot

# 5. OAuth sessions will still exist in database but won't be used
# Old in-memory storage will take over
```

**Discord Bot Rollback:**
```bash
# 1. Stop service
docker-compose stop discord-bot

# 2. Revert code
git revert <commit-hash>

# 3. Rebuild
docker-compose build discord-bot

# 4. Start service
docker-compose up -d discord-bot

# 5. Threads will revert to admin channel (old behavior)
# Existing organized channels can remain for manual cleanup
```

**Database Rollback (Stream Bot):**
```bash
# Only if oauth_sessions table causes issues

# 1. Drop table (sessions in progress will fail - acceptable during rollback)
psql "postgresql://streambot:<password>@discord-bot-db:5432/streambot" -c "DROP TABLE IF EXISTS oauth_sessions CASCADE;"

# 2. Or restore from backup
psql "postgresql://streambot:<password>@discord-bot-db:5432/streambot" < streambot_backup_YYYYMMDD.sql
```

---

## 📊 Success Metrics

**Discord Bot:**
- ✅ Tickets created in organized categories (not admin channel)
- ✅ Zero thread overflow errors
- ✅ Cleanup job runs daily without errors
- ✅ Thread sync still works between Discord and dashboard

**Stream Bot:**
- ✅ OAuth success rate > 99%
- ✅ Zero replay attack successes
- ✅ Session cleanup runs hourly
- ✅ Database query performance < 50ms

**Overall:**
- ✅ Zero production incidents
- ✅ No user-facing errors
- ✅ All health checks passing
- ✅ Services recoverable from restart

---

## ❗ Known Limitations

1. **Discord Bot:** Existing tickets in admin channel won't be auto-migrated to new system. New tickets will use new organization.

2. **Stream Bot:** Active OAuth flows at time of deployment will fail (users must restart OAuth). Schedule deployment during low-traffic window.

3. **Kick Integration:** Kick token refresh not yet implemented (waiting on Kick API documentation).

---

## 🆘 Emergency Contacts

**Issues During Deployment:**
- Check deployment checklist: `docs/DEPLOYMENT_READINESS_CHECKLIST.md`
- Check logs: `docker-compose logs -f <service-name>`
- Use rollback plan above if critical
- Document all issues for post-mortem

**Post-Deployment Support:**
- Monitor error rates for 48 hours
- User-reported issues should be triaged within 1 hour
- Critical issues should trigger immediate rollback
