/**
 * GitHub Webhook Handler
 * Receives GitHub events and posts to Discord + triggers deployments
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

const router = Router();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

interface GitHubWebhookConfig {
  guildId: string;
  channelId: string;
  events: string[];
  autoDeployBranch?: string;
  deployCommand?: string;
}

const webhookConfigs: Map<string, GitHubWebhookConfig> = new Map();

function verifySignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) return true;
  
  const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function getEventEmoji(event: string): string {
  const emojis: Record<string, string> = {
    'push': '📤',
    'pull_request': '🔀',
    'issues': '🐛',
    'issue_comment': '💬',
    'create': '🌱',
    'delete': '🗑️',
    'release': '🚀',
    'workflow_run': '⚙️',
    'check_run': '✅',
    'star': '⭐',
    'fork': '🍴',
    'watch': '👀',
    'deployment': '🎯',
    'deployment_status': '📊'
  };
  return emojis[event] || '📌';
}

function getStatusColor(status: string): number {
  const colors: Record<string, number> = {
    'success': 0x3fb950,
    'completed': 0x3fb950,
    'failure': 0xf85149,
    'failed': 0xf85149,
    'error': 0xf85149,
    'cancelled': 0x848d97,
    'pending': 0xd29922,
    'in_progress': 0x58a6ff,
    'queued': 0x58a6ff,
    'opened': 0x3fb950,
    'closed': 0xf85149,
    'merged': 0x8957e5
  };
  return colors[status?.toLowerCase()] || 0x58a6ff;
}

async function sendDiscordNotification(
  client: Client,
  config: GitHubWebhookConfig,
  embed: EmbedBuilder
): Promise<boolean> {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return false;
    
    const channel = guild.channels.cache.get(config.channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) return false;
    
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error('[GitHub Webhook] Error sending Discord notification:', error);
    return false;
  }
}

function createPushEmbed(payload: any): EmbedBuilder {
  const commits = payload.commits || [];
  const commitCount = commits.length;
  const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
  const repoName = payload.repository?.full_name || 'Unknown Repo';
  const pusher = payload.pusher?.name || 'Unknown';
  
  const commitList = commits.slice(0, 5).map((c: any) => 
    `[\`${c.id.substring(0, 7)}\`](${c.url}) ${c.message.split('\n')[0].substring(0, 50)}`
  ).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`${getEventEmoji('push')} ${commitCount} commit${commitCount !== 1 ? 's' : ''} pushed to ${branch}`)
    .setURL(payload.compare)
    .setColor(0x58a6ff)
    .setAuthor({
      name: pusher,
      iconURL: payload.sender?.avatar_url
    })
    .setDescription(commitList || 'No commits')
    .setFooter({ text: repoName })
    .setTimestamp();
  
  if (commitCount > 5) {
    embed.addFields({ name: 'And more...', value: `+${commitCount - 5} additional commit(s)`, inline: true });
  }
  
  return embed;
}

function createPREmbed(payload: any): EmbedBuilder {
  const pr = payload.pull_request;
  const action = payload.action;
  const repoName = payload.repository?.full_name || 'Unknown Repo';
  
  let color = getStatusColor(action);
  if (pr.merged) color = getStatusColor('merged');
  
  const embed = new EmbedBuilder()
    .setTitle(`${getEventEmoji('pull_request')} PR #${pr.number} ${action}: ${pr.title.substring(0, 80)}`)
    .setURL(pr.html_url)
    .setColor(color)
    .setAuthor({
      name: pr.user?.login || 'Unknown',
      iconURL: pr.user?.avatar_url
    })
    .setDescription(pr.body?.substring(0, 200) || 'No description')
    .addFields(
      { name: 'Base', value: pr.base?.ref || 'unknown', inline: true },
      { name: 'Head', value: pr.head?.ref || 'unknown', inline: true },
      { name: 'Changes', value: `+${pr.additions || 0} / -${pr.deletions || 0}`, inline: true }
    )
    .setFooter({ text: repoName })
    .setTimestamp();
  
  return embed;
}

function createWorkflowEmbed(payload: any): EmbedBuilder {
  const run = payload.workflow_run;
  const repoName = payload.repository?.full_name || 'Unknown Repo';
  
  const status = run.conclusion || run.status;
  const emoji = status === 'success' ? '✅' : status === 'failure' ? '❌' : '⏳';
  
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Workflow: ${run.name}`)
    .setURL(run.html_url)
    .setColor(getStatusColor(status))
    .addFields(
      { name: 'Status', value: status || 'unknown', inline: true },
      { name: 'Branch', value: run.head_branch || 'unknown', inline: true },
      { name: 'Duration', value: formatDuration(run.run_started_at, run.updated_at), inline: true }
    )
    .setFooter({ text: repoName })
    .setTimestamp();
  
  return embed;
}

function createReleaseEmbed(payload: any): EmbedBuilder {
  const release = payload.release;
  const repoName = payload.repository?.full_name || 'Unknown Repo';
  
  const embed = new EmbedBuilder()
    .setTitle(`${getEventEmoji('release')} New Release: ${release.tag_name}`)
    .setURL(release.html_url)
    .setColor(0x3fb950)
    .setAuthor({
      name: release.author?.login || 'Unknown',
      iconURL: release.author?.avatar_url
    })
    .setDescription(release.body?.substring(0, 500) || 'No release notes')
    .addFields(
      { name: 'Tag', value: release.tag_name, inline: true },
      { name: 'Pre-release', value: release.prerelease ? 'Yes' : 'No', inline: true }
    )
    .setFooter({ text: repoName })
    .setTimestamp();
  
  return embed;
}

function formatDuration(start: string, end: string): string {
  if (!start || !end) return 'N/A';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

let discordClient: Client | null = null;

export function setDiscordClient(client: Client) {
  discordClient = client;
}

router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const event = req.headers['x-github-event'] as string;
      const signature = req.headers['x-hub-signature-256'] as string;
      const delivery = req.headers['x-github-delivery'] as string;
      
      console.log(`[GitHub Webhook] Received event: ${event} (${delivery})`);
      
      const rawBody = JSON.stringify(req.body);
      if (GITHUB_WEBHOOK_SECRET && !verifySignature(rawBody, signature || '')) {
        console.error('[GitHub Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const payload = req.body;
      const repoFullName = payload.repository?.full_name;
      
      let embed: EmbedBuilder | null = null;
      
      switch (event) {
        case 'push':
          embed = createPushEmbed(payload);
          break;
        case 'pull_request':
          embed = createPREmbed(payload);
          break;
        case 'workflow_run':
          if (payload.action === 'completed') {
            embed = createWorkflowEmbed(payload);
          }
          break;
        case 'release':
          if (payload.action === 'published') {
            embed = createReleaseEmbed(payload);
          }
          break;
        case 'check_run':
          break;
        default:
          console.log(`[GitHub Webhook] Unhandled event: ${event}`);
      }
      
      if (embed && discordClient) {
        for (const [_, config] of webhookConfigs) {
          if (config.events.includes(event) || config.events.includes('*')) {
            await sendDiscordNotification(discordClient, config, embed);
          }
        }
      }
      
      res.status(200).json({ success: true, event, delivery });
    } catch (error) {
      console.error('[GitHub Webhook] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
router.get('/configs', (req: Request, res: Response) => {
  const configs = Array.from(webhookConfigs.entries()).map(([repo, config]) => ({
    repository: repo,
    ...config
  }));
  res.json({ success: true, configs });
});

router.post('/configs', (req: Request, res: Response) => {
  const { repository, guildId, channelId, events, autoDeployBranch, deployCommand } = req.body;
  
  if (!repository || !guildId || !channelId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  webhookConfigs.set(repository, {
    guildId,
    channelId,
    events: events || ['push', 'pull_request', 'workflow_run', 'release'],
    autoDeployBranch,
    deployCommand
  });
  
  res.json({ success: true, message: `Webhook configured for ${repository}` });
});

router.delete('/configs/:repository', (req: Request, res: Response) => {
  const repository = decodeURIComponent(req.params.repository);
  
  if (webhookConfigs.delete(repository)) {
    res.json({ success: true, message: `Webhook removed for ${repository}` });
  } else {
    res.status(404).json({ error: 'Configuration not found' });
  }
});

export default router;
