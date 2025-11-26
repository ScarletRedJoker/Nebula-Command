import { db } from "./db";
import { 
  onboardingProgress, 
  platformConnections,
  users,
  type OnboardingProgress, 
  type UpdateOnboardingProgress 
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { featureToggleService } from "./feature-toggle-service";

export interface OnboardingStep {
  step: number;
  name: string;
  title: string;
  description: string;
  completed: boolean;
  current: boolean;
}

export interface OnboardingStatus {
  userId: string;
  isComplete: boolean;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  platformStatus: {
    twitch: boolean;
    youtube: boolean;
    kick: boolean;
    spotify: boolean;
  };
  enabledFeatures: string[];
  progress: OnboardingProgress | null;
}

const ONBOARDING_STEPS: Omit<OnboardingStep, 'completed' | 'current'>[] = [
  {
    step: 1,
    name: 'welcome',
    title: 'Welcome',
    description: 'Get started with your streaming bot'
  },
  {
    step: 2,
    name: 'platforms',
    title: 'Connect Platforms',
    description: 'Connect your streaming platforms (Twitch, YouTube, Kick) and Spotify'
  },
  {
    step: 3,
    name: 'features',
    title: 'Enable Features',
    description: 'Choose which features to enable for your bot'
  },
  {
    step: 4,
    name: 'settings',
    title: 'Configure Settings',
    description: 'Customize your bot settings and preferences'
  },
  {
    step: 5,
    name: 'finish',
    title: 'Review & Finish',
    description: 'Review your setup and start your bot'
  }
];

class OnboardingService {
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
    const [progress] = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, userId));
    return progress || null;
  }

  async getOrCreateOnboardingProgress(userId: string): Promise<OnboardingProgress> {
    let progress = await this.getOnboardingProgress(userId);
    
    if (!progress) {
      const platformStatus = await this.getPlatformConnectionStatus(userId);
      
      [progress] = await db
        .insert(onboardingProgress)
        .values({
          userId,
          currentStep: 1,
          welcomeCompleted: false,
          platformsCompleted: false,
          featuresCompleted: false,
          settingsCompleted: false,
          finishCompleted: false,
          twitchConnected: platformStatus.twitch,
          youtubeConnected: platformStatus.youtube,
          kickConnected: platformStatus.kick,
          spotifyConnected: platformStatus.spotify,
          enabledFeatures: [],
          startedAt: new Date(),
        })
        .returning();
      
      console.log(`[Onboarding] Created onboarding progress for user: ${userId}`);
    }
    
    return progress;
  }

  async getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    const progress = await this.getOrCreateOnboardingProgress(userId);
    const platformStatus = await this.getPlatformConnectionStatus(userId);
    const enabledFeatures = await featureToggleService.getEnabledFeatures(userId);

    await this.syncPlatformStatus(userId, platformStatus);

    const steps: OnboardingStep[] = ONBOARDING_STEPS.map(step => ({
      ...step,
      completed: this.isStepCompleted(progress, step.name),
      current: progress.currentStep === step.step,
    }));

    const isComplete = progress.finishCompleted;

    return {
      userId,
      isComplete,
      currentStep: progress.currentStep,
      totalSteps: ONBOARDING_STEPS.length,
      steps,
      platformStatus,
      enabledFeatures,
      progress,
    };
  }

  async updateOnboardingProgress(userId: string, updates: Partial<UpdateOnboardingProgress>): Promise<OnboardingProgress> {
    await this.getOrCreateOnboardingProgress(userId);

    const [updated] = await db
      .update(onboardingProgress)
      .set({
        ...updates,
        lastVisitedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.userId, userId))
      .returning();

    console.log(`[Onboarding] Updated progress for user ${userId}:`, Object.keys(updates));
    return updated;
  }

  async completeStep(userId: string, stepName: string): Promise<OnboardingProgress> {
    const progress = await this.getOrCreateOnboardingProgress(userId);
    
    const updates: Partial<UpdateOnboardingProgress> = {};
    
    switch (stepName) {
      case 'welcome':
        updates.welcomeCompleted = true;
        if (progress.currentStep === 1) updates.currentStep = 2;
        break;
      case 'platforms':
        updates.platformsCompleted = true;
        if (progress.currentStep === 2) updates.currentStep = 3;
        break;
      case 'features':
        updates.featuresCompleted = true;
        if (progress.currentStep === 3) updates.currentStep = 4;
        break;
      case 'settings':
        updates.settingsCompleted = true;
        if (progress.currentStep === 4) updates.currentStep = 5;
        break;
      case 'finish':
        updates.finishCompleted = true;
        updates.completedAt = new Date();
        await this.markUserOnboardingComplete(userId);
        break;
    }

    const updated = await this.updateOnboardingProgress(userId, updates);
    console.log(`[Onboarding] Completed step '${stepName}' for user ${userId}`);
    return updated;
  }

  async goToStep(userId: string, step: number): Promise<OnboardingProgress> {
    if (step < 1 || step > ONBOARDING_STEPS.length) {
      throw new Error(`Invalid step number: ${step}`);
    }

    return this.updateOnboardingProgress(userId, { currentStep: step });
  }

  async setEnabledFeatures(userId: string, features: string[]): Promise<OnboardingProgress> {
    return this.updateOnboardingProgress(userId, { enabledFeatures: features });
  }

  async resetOnboarding(userId: string): Promise<OnboardingProgress> {
    await db
      .delete(onboardingProgress)
      .where(eq(onboardingProgress.userId, userId));
    
    await db
      .update(users)
      .set({ 
        onboardingCompleted: false, 
        onboardingStep: 1,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));

    console.log(`[Onboarding] Reset onboarding for user ${userId}`);
    return this.getOrCreateOnboardingProgress(userId);
  }

  async skipOnboarding(userId: string): Promise<OnboardingProgress> {
    const updates: Partial<UpdateOnboardingProgress> = {
      welcomeCompleted: true,
      platformsCompleted: true,
      featuresCompleted: true,
      settingsCompleted: true,
      finishCompleted: true,
      currentStep: 5,
      completedAt: new Date(),
    };

    await this.markUserOnboardingComplete(userId);
    const updated = await this.updateOnboardingProgress(userId, updates);
    console.log(`[Onboarding] Skipped onboarding for user ${userId}`);
    return updated;
  }

  private async getPlatformConnectionStatus(userId: string): Promise<{
    twitch: boolean;
    youtube: boolean;
    kick: boolean;
    spotify: boolean;
  }> {
    const connections = await db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.userId, userId));

    const status = {
      twitch: false,
      youtube: false,
      kick: false,
      spotify: false,
    };

    for (const conn of connections) {
      if (conn.platform === 'twitch' && conn.isConnected) status.twitch = true;
      if (conn.platform === 'youtube' && conn.isConnected) status.youtube = true;
      if (conn.platform === 'kick' && conn.isConnected) status.kick = true;
      if (conn.platform === 'spotify' && conn.isConnected) status.spotify = true;
    }

    return status;
  }

  private async syncPlatformStatus(userId: string, status: {
    twitch: boolean;
    youtube: boolean;
    kick: boolean;
    spotify: boolean;
  }): Promise<void> {
    await db
      .update(onboardingProgress)
      .set({
        twitchConnected: status.twitch,
        youtubeConnected: status.youtube,
        kickConnected: status.kick,
        spotifyConnected: status.spotify,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.userId, userId));
  }

  private isStepCompleted(progress: OnboardingProgress, stepName: string): boolean {
    switch (stepName) {
      case 'welcome': return progress.welcomeCompleted;
      case 'platforms': return progress.platformsCompleted;
      case 'features': return progress.featuresCompleted;
      case 'settings': return progress.settingsCompleted;
      case 'finish': return progress.finishCompleted;
      default: return false;
    }
  }

  private async markUserOnboardingComplete(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        onboardingCompleted: true, 
        onboardingStep: 5,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));
  }

  getStepInfo(): typeof ONBOARDING_STEPS {
    return ONBOARDING_STEPS;
  }
}

export const onboardingService = new OnboardingService();
