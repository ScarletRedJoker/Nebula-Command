import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ConnectPlatformDialog } from "@/components/connect-platform-dialog";
import { Check, ChevronRight, Sparkles, Zap, Settings, Rocket } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";

const steps = [
  {
    id: 1,
    title: "Connect a Platform",
    description: "Choose which streaming platform you want to use with StreamBot",
    icon: Sparkles,
  },
  {
    id: 2,
    title: "Configure Settings",
    description: "Set up basic bot behavior and posting intervals",
    icon: Settings,
  },
  {
    id: 3,
    title: "Test Your First Command",
    description: "Post your first AI-generated Snapple fact!",
    icon: Zap,
  },
  {
    id: 4,
    title: "Enable Features",
    description: "Activate the features you want to use",
    icon: Rocket,
  },
];

export function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const { data: platforms } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/complete-onboarding", {});
    },
    onSuccess: () => {
      refreshUser();
      toast({
        title: "Welcome to StreamBot! 🎉",
        description: "You're all set up and ready to start streaming!",
      });
    },
  });

  const skipOnboardingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/skip-onboarding", {});
    },
    onSuccess: () => {
      refreshUser();
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: {
      platform: string;
      platformUsername: string;
      accessToken: string;
      channelId?: string;
      botUsername?: string;
      bearerToken?: string;
      cookies?: string;
    }) => {
      const existingConnection = platforms?.find((p) => p.platform === data.platform);
      const connectionData: any = {
        botUsername: data.botUsername || data.platformUsername,
      };

      if (data.platform === "kick") {
        connectionData.bearerToken = data.bearerToken;
        connectionData.cookies = data.cookies;
      }

      if (existingConnection) {
        return await apiRequest("PATCH", `/api/platforms/${existingConnection.id}`, {
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
          platformUsername: data.platformUsername,
          accessToken: data.accessToken,
          channelId: data.channelId || data.platformUsername.toLowerCase(),
          connectionData,
        });
      } else {
        return await apiRequest("POST", "/api/platforms", {
          platform: data.platform,
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
          platformUsername: data.platformUsername,
          platformUserId: data.platformUsername.toLowerCase(),
          accessToken: data.accessToken,
          channelId: data.channelId || data.platformUsername.toLowerCase(),
          connectionData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      setConnectDialogOpen(false);
      setCurrentStep(2);
      toast({
        title: "Platform Connected!",
        description: "Great! Let's configure your bot settings.",
      });
    },
  });

  const enableBotMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", "/api/settings", {
        intervalMode: "manual",
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setCurrentStep(3);
    },
  });

  const postFirstFactMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/trigger-fact", {});
    },
    onSuccess: () => {
      setCurrentStep(4);
      toast({
        title: "Fact Posted! 🎉",
        description: "Your first Snapple fact has been posted to chat!",
      });
    },
  });

  if (!user || user.onboardingCompleted) {
    return null;
  }

  const progress = (currentStep / steps.length) * 100;
  const connectedPlatforms = platforms?.filter((p) => p.isConnected) || [];

  const handleConnectPlatform = (platform: string) => {
    setSelectedPlatform(platform);
    setConnectDialogOpen(true);
  };

  const handleSkip = () => {
    skipOnboardingMutation.mutate();
  };

  const handleComplete = () => {
    completeOnboardingMutation.mutate();
  };

  return (
    <>
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader className="space-y-1 sm:space-y-2">
            <DialogTitle className="text-xl sm:text-2xl candy-gradient-text">Welcome to StreamBot! 🎉</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Let's get you set up in just a few steps!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
            {/* Progress Bar */}
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">Step {currentStep}/{steps.length}</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5 sm:h-2" />
            </div>

            {/* Step Indicators */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex flex-col items-center text-center gap-1 sm:gap-2 p-2 sm:p-3 rounded-lg transition-colors ${
                    step.id === currentStep
                      ? "bg-primary/10 border border-primary/20"
                      : step.id < currentStep
                      ? "bg-green-500/10 border border-green-500/20"
                      : "bg-muted/50"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center h-6 w-6 sm:h-8 sm:w-8 rounded-full ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step.id < currentStep
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.id < currentStep ? (
                      <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : (
                      <step.icon className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </div>
                  <div className="text-[10px] sm:text-xs font-medium hidden xs:block truncate max-w-full">{step.title}</div>
                </div>
              ))}
            </div>

            {/* Step Content */}
            <Card className="candy-glass-card">
              <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                <div className="space-y-1 sm:space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    {(() => {
                      const StepIcon = steps[currentStep - 1].icon;
                      return StepIcon ? <StepIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> : null;
                    })()}
                    {steps[currentStep - 1].title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {steps[currentStep - 1].description}
                  </p>
                </div>

                {/* Step 1: Connect Platform */}
                {currentStep === 1 && (
                  <div className="space-y-3 pt-1 sm:pt-2">
                    {connectedPlatforms.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-green-600 dark:text-green-400">
                          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span>Connected! Add more or continue.</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {connectedPlatforms.map((platform) => (
                            <Badge key={platform.id} variant="outline" className="text-xs">
                              {platform.platform}: @{platform.platformUsername}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                        Choose a platform:
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        className="h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 candy-touch-target"
                        onClick={() => handleConnectPlatform("twitch")}
                      >
                        <SiTwitch className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />
                        <span className="text-xs sm:text-sm">Twitch</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 candy-touch-target"
                        onClick={() => handleConnectPlatform("youtube")}
                      >
                        <SiYoutube className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
                        <span className="text-xs sm:text-sm">YouTube</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 candy-touch-target"
                        onClick={() => handleConnectPlatform("kick")}
                      >
                        <SiKick className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
                        <span className="text-xs sm:text-sm">Kick</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Configure Settings */}
                {currentStep === 2 && (
                  <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                    <p className="text-xs sm:text-sm">
                      We'll set your bot to <strong>Manual Mode</strong>. You control when facts post!
                    </p>
                    <div className="bg-muted/50 rounded-lg p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-medium">Bot Mode</span>
                        <Badge className="text-xs">Manual</Badge>
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Use Quick Trigger to post facts
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 3: Test Command */}
                {currentStep === 3 && (
                  <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                    <p className="text-xs sm:text-sm">
                      Ready to post your first AI-generated fact?
                    </p>
                    <Button
                      onClick={() => postFirstFactMutation.mutate()}
                      disabled={postFirstFactMutation.isPending}
                      className="w-full candy-button border-0 h-10 sm:h-11"
                      size="lg"
                    >
                      {postFirstFactMutation.isPending ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                          <span className="text-sm">Generating...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          <span className="text-sm">Post My First Fact!</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Step 4: Enable Features */}
                {currentStep === 4 && (
                  <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                    <p className="text-xs sm:text-sm">
                      You're all set! Explore more features from the sidebar.
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
                        <div className="text-xs sm:text-sm font-medium">Commands</div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          Custom chat commands
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
                        <div className="text-xs sm:text-sm font-medium">Giveaways</div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          Run viewer raffles
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
                        <div className="text-xs sm:text-sm font-medium">Currency</div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          Points system
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3 space-y-0.5 sm:space-y-1">
                        <div className="text-xs sm:text-sm font-medium">AI Chatbot</div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          AI responses
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1 sm:pt-2">
              <Button variant="ghost" onClick={handleSkip} className="text-xs sm:text-sm h-9 sm:h-10">
                Skip
              </Button>
              <div className="flex gap-2">
                {currentStep > 1 && currentStep < 4 && (
                  <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} className="h-9 sm:h-10 text-xs sm:text-sm">
                    Back
                  </Button>
                )}
                {currentStep === 1 && connectedPlatforms.length > 0 && (
                  <Button onClick={() => setCurrentStep(2)} className="h-9 sm:h-10 text-xs sm:text-sm candy-button border-0">
                    Continue
                    <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1" />
                  </Button>
                )}
                {currentStep === 2 && (
                  <Button onClick={() => enableBotMutation.mutate()} className="h-9 sm:h-10 text-xs sm:text-sm candy-button border-0">
                    Continue
                    <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1" />
                  </Button>
                )}
                {currentStep === 4 && (
                  <Button onClick={handleComplete} className="h-9 sm:h-10 text-xs sm:text-sm candy-button border-0">
                    Complete
                    <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Platform Connection Dialog */}
      <ConnectPlatformDialog
        platform={selectedPlatform || "twitch"}
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onConnect={(data) => connectMutation.mutate(data)}
        isPending={connectMutation.isPending}
      />
    </>
  );
}
