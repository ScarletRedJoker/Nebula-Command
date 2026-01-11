import { BotSettings } from '../../shared/schema';

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  emoji: string;
  settingKey: keyof BotSettings | null;
  dependencies?: string[];
  requiredChannels?: string[];
  isPremium?: boolean;
}

export type FeatureCategory = 
  | 'moderation'
  | 'community'
  | 'engagement'
  | 'utility'
  | 'notifications'
  | 'tickets'
  | 'media'
  | 'logging';

export const FEATURE_CATEGORIES: Record<FeatureCategory, { name: string; emoji: string; description: string }> = {
  moderation: {
    name: 'Moderation',
    emoji: '🛡️',
    description: 'Keep your server safe with auto-moderation and moderation tools'
  },
  community: {
    name: 'Community',
    emoji: '👥',
    description: 'Welcome members, assign roles, and build community'
  },
  engagement: {
    name: 'Engagement',
    emoji: '🎮',
    description: 'Keep members active with XP, giveaways, and fun features'
  },
  utility: {
    name: 'Utility',
    emoji: '🔧',
    description: 'Useful tools like custom commands and suggestions'
  },
  notifications: {
    name: 'Notifications',
    emoji: '📣',
    description: 'Stream alerts, boost notifications, and announcements'
  },
  tickets: {
    name: 'Tickets',
    emoji: '🎫',
    description: 'Support ticket system for member assistance'
  },
  media: {
    name: 'Media',
    emoji: '🎬',
    description: 'Plex requests and media management'
  },
  logging: {
    name: 'Logging',
    emoji: '📝',
    description: 'Track server activity and member actions'
  }
};

export const FEATURES: FeatureDefinition[] = [
  {
    id: 'welcome',
    name: 'Welcome Messages',
    description: 'Automatically greet new members when they join',
    category: 'community',
    emoji: '👋',
    settingKey: 'welcomeEnabled',
    requiredChannels: ['welcomeChannelId']
  },
  {
    id: 'goodbye',
    name: 'Goodbye Messages',
    description: 'Send farewell messages when members leave',
    category: 'community',
    emoji: '👋',
    settingKey: 'goodbyeEnabled',
    requiredChannels: ['welcomeChannelId']
  },
  {
    id: 'autorole',
    name: 'Auto Roles',
    description: 'Automatically assign roles to new members',
    category: 'community',
    emoji: '🎭',
    settingKey: null
  },
  {
    id: 'xp',
    name: 'XP & Leveling',
    description: 'Reward active members with XP and level-up rewards',
    category: 'engagement',
    emoji: '⭐',
    settingKey: 'xpEnabled'
  },
  {
    id: 'starboard',
    name: 'Starboard',
    description: 'Highlight popular messages with reactions',
    category: 'engagement',
    emoji: '⭐',
    settingKey: 'starboardEnabled',
    requiredChannels: ['starboardChannelId']
  },
  {
    id: 'birthday',
    name: 'Birthday Tracker',
    description: 'Celebrate member birthdays with announcements',
    category: 'engagement',
    emoji: '🎂',
    settingKey: 'birthdayEnabled',
    requiredChannels: ['birthdayChannelId']
  },
  {
    id: 'automod',
    name: 'Auto Moderation',
    description: 'Automatically filter spam, links, and bad words',
    category: 'moderation',
    emoji: '🤖',
    settingKey: 'autoModEnabled'
  },
  {
    id: 'linkfilter',
    name: 'Link Filter',
    description: 'Block or whitelist specific domains',
    category: 'moderation',
    emoji: '🔗',
    settingKey: 'linkFilterEnabled',
    dependencies: ['automod']
  },
  {
    id: 'logging',
    name: 'Server Logging',
    description: 'Log message edits, deletes, joins, and mod actions',
    category: 'logging',
    emoji: '📋',
    settingKey: null,
    requiredChannels: ['loggingChannelId']
  },
  {
    id: 'invitetracking',
    name: 'Invite Tracking',
    description: 'Track who invited new members',
    category: 'logging',
    emoji: '🔗',
    settingKey: 'inviteTrackingEnabled',
    requiredChannels: ['inviteLogChannelId']
  },
  {
    id: 'boosttracking',
    name: 'Boost Tracking',
    description: 'Thank and recognize server boosters',
    category: 'notifications',
    emoji: '🚀',
    settingKey: 'boostTrackingEnabled',
    requiredChannels: ['boostChannelId']
  },
  {
    id: 'tickets',
    name: 'Support Tickets',
    description: 'Create and manage support tickets',
    category: 'tickets',
    emoji: '🎫',
    settingKey: null,
    requiredChannels: ['ticketChannelId']
  },
  {
    id: 'threads',
    name: 'Thread Integration',
    description: 'Sync Discord threads with tickets',
    category: 'tickets',
    emoji: '🧵',
    settingKey: 'threadIntegrationEnabled'
  },
  {
    id: 'autoclose',
    name: 'Auto-Close Tickets',
    description: 'Automatically close inactive tickets',
    category: 'tickets',
    emoji: '⏰',
    settingKey: 'autoCloseEnabled'
  },
  {
    id: 'plexrequests',
    name: 'Plex Requests',
    description: 'Allow members to request media for Plex',
    category: 'media',
    emoji: '🎬',
    settingKey: null,
    requiredChannels: ['plexRequestChannelId']
  },
  {
    id: 'notifications',
    name: 'Admin Notifications',
    description: 'Send ticket notifications to admin channel',
    category: 'notifications',
    emoji: '🔔',
    settingKey: 'adminNotificationsEnabled'
  }
];

class FeatureRegistry {
  private features: Map<string, FeatureDefinition> = new Map();

  constructor() {
    FEATURES.forEach(feature => {
      this.features.set(feature.id, feature);
    });
  }

  getFeature(id: string): FeatureDefinition | undefined {
    return this.features.get(id);
  }

  getAllFeatures(): FeatureDefinition[] {
    return Array.from(this.features.values());
  }

  getFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
    return this.getAllFeatures().filter(f => f.category === category);
  }

  isFeatureEnabled(settings: BotSettings, featureId: string): boolean {
    const feature = this.getFeature(featureId);
    if (!feature) return false;
    
    if (!feature.settingKey) {
      return true;
    }
    
    const value = settings[feature.settingKey];
    return value === true;
  }

  getEnabledFeatures(settings: BotSettings): FeatureDefinition[] {
    return this.getAllFeatures().filter(f => this.isFeatureEnabled(settings, f.id));
  }

  getDisabledFeatures(settings: BotSettings): FeatureDefinition[] {
    return this.getAllFeatures().filter(f => !this.isFeatureEnabled(settings, f.id));
  }

  getMissingChannels(settings: BotSettings, featureId: string): string[] {
    const feature = this.getFeature(featureId);
    if (!feature?.requiredChannels) return [];
    
    return feature.requiredChannels.filter(channel => {
      const value = settings[channel as keyof BotSettings];
      return !value;
    });
  }

  getFeatureStatus(settings: BotSettings, featureId: string): {
    enabled: boolean;
    configured: boolean;
    missingChannels: string[];
    missingDependencies: string[];
  } {
    const feature = this.getFeature(featureId);
    if (!feature) {
      return { enabled: false, configured: false, missingChannels: [], missingDependencies: [] };
    }

    const enabled = this.isFeatureEnabled(settings, featureId);
    const missingChannels = this.getMissingChannels(settings, featureId);
    
    const missingDependencies = (feature.dependencies || []).filter(
      depId => !this.isFeatureEnabled(settings, depId)
    );

    const configured = missingChannels.length === 0 && missingDependencies.length === 0;

    return { enabled, configured, missingChannels, missingDependencies };
  }

  getCategories(): FeatureCategory[] {
    return Object.keys(FEATURE_CATEGORIES) as FeatureCategory[];
  }

  getCategoryInfo(category: FeatureCategory) {
    return FEATURE_CATEGORIES[category];
  }

  formatFeatureList(settings: BotSettings): string {
    const lines: string[] = [];
    
    for (const category of this.getCategories()) {
      const categoryInfo = this.getCategoryInfo(category);
      const features = this.getFeaturesByCategory(category);
      
      if (features.length === 0) continue;
      
      lines.push(`\n**${categoryInfo.emoji} ${categoryInfo.name}**`);
      
      for (const feature of features) {
        const status = this.getFeatureStatus(settings, feature.id);
        const statusEmoji = status.enabled 
          ? (status.configured ? '✅' : '⚠️') 
          : '❌';
        lines.push(`${statusEmoji} ${feature.emoji} **${feature.name}** - ${feature.description}`);
      }
    }
    
    return lines.join('\n');
  }
}

export const featureRegistry = new FeatureRegistry();
