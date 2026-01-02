import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import type { BotSettings, UpdateBotSettings } from "@shared/schema";
import { z } from "zod";
import { SpotifyCardMultiUser } from "@/components/spotify-card-multiuser";
import { YouTubeCardMultiUser } from "@/components/youtube-card-multiuser";
import { TwitchCardMultiUser } from "@/components/twitch-card-multiuser";

const settingsFormSchema = z.object({
  intervalMode: z.enum(["fixed", "random", "manual"]),
  fixedIntervalMinutes: z.coerce.number().min(1).max(1440).optional(),
  randomMinMinutes: z.coerce.number().min(1).max(1440).optional(),
  randomMaxMinutes: z.coerce.number().min(1).max(1440).optional(),
  aiModel: z.string(),
  aiPromptTemplate: z.string().optional(),
  enableChatTriggers: z.boolean(),
  chatKeywords: z.array(z.string()),
  activePlatforms: z.array(z.string()),
  isActive: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const { data: settings, isLoading } = useQuery<BotSettings>({
    queryKey: ["/api/settings"],
  });

  // Handle OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyConnected = params.get('spotify') === 'connected';
    const youtubeConnected = params.get('youtube') === 'connected';
    const twitchConnected = params.get('twitch') === 'connected';
    const errorParam = params.get('error');

    if (spotifyConnected || youtubeConnected || twitchConnected) {
      const platform = spotifyConnected ? 'Spotify' : youtubeConnected ? 'YouTube' : 'Twitch';
      toast({
        title: `${platform} Connected`,
        description: `Your ${platform} account has been successfully connected.`,
      });
      // Refresh platforms list
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/platforms"] });
      // Clear URL params
      window.history.replaceState({}, '', '/settings');
    }

    if (errorParam) {
      toast({
        title: "Connection Failed",
        description: `OAuth error: ${errorParam.replace(/_/g, ' ')}`,
        variant: "destructive",
      });
      // Clear URL params
      window.history.replaceState({}, '', '/settings');
    }
  }, [toast]);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      intervalMode: "manual",
      fixedIntervalMinutes: 15,
      randomMinMinutes: 5,
      randomMaxMinutes: 30,
      aiModel: "gpt-4o",
      aiPromptTemplate: "",
      enableChatTriggers: true,
      chatKeywords: ["!snapple", "!fact"],
      activePlatforms: [],
      isActive: false,
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      form.reset({
        intervalMode: settings.intervalMode as "fixed" | "random" | "manual",
        fixedIntervalMinutes: settings.fixedIntervalMinutes || 15,
        randomMinMinutes: settings.randomMinMinutes || 5,
        randomMaxMinutes: settings.randomMaxMinutes || 30,
        aiModel: settings.aiModel,
        aiPromptTemplate: settings.aiPromptTemplate || "",
        enableChatTriggers: settings.enableChatTriggers,
        chatKeywords: settings.chatKeywords || ["!snapple", "!fact"],
        activePlatforms: settings.activePlatforms || [],
        isActive: settings.isActive,
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      return await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your bot settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate(data);
  };

  const intervalMode = form.watch("intervalMode");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold candy-gradient-text">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
          Configure your bot behavior
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Bot Status */}
          <Card className="candy-glass-card">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Bot Status</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Control whether the bot is actively posting
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 sm:p-4 gap-3">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base">Enable Bot</FormLabel>
                      <FormDescription className="text-xs sm:text-sm">
                        Turn on automated fact posting
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-bot-active"
                        className="candy-touch-target"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Interval Configuration */}
          <Card className="candy-glass-card">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Posting Interval</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Choose how often the bot posts facts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
              <FormField
                control={form.control}
                name="intervalMode"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm">Interval Mode</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <FormControl>
                            <RadioGroupItem value="manual" data-testid="radio-manual" className="candy-touch-target" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-xs sm:text-sm flex-1">
                            <span className="font-medium">Manual</span>
                            <span className="hidden sm:inline"> - Post on demand only</span>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <FormControl>
                            <RadioGroupItem value="fixed" data-testid="radio-fixed" className="candy-touch-target" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-xs sm:text-sm flex-1">
                            <span className="font-medium">Fixed</span>
                            <span className="hidden sm:inline"> - Post at regular intervals</span>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <FormControl>
                            <RadioGroupItem value="random" data-testid="radio-random" className="candy-touch-target" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-xs sm:text-sm flex-1">
                            <span className="font-medium">Random</span>
                            <span className="hidden sm:inline"> - Random intervals within range</span>
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              {intervalMode === "fixed" && (
                <FormField
                  control={form.control}
                  name="fixedIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Fixed Interval (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="input-fixed-interval"
                          className="h-10 sm:h-9"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Post every X minutes (1-1440)
                      </FormDescription>
                    </FormItem>
                  )}
                />
              )}

              {intervalMode === "random" && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <FormField
                    control={form.control}
                    name="randomMinMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs sm:text-sm">Min (min)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-random-min"
                            className="h-10 sm:h-9"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="randomMaxMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs sm:text-sm">Max (min)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-random-max"
                            className="h-10 sm:h-9"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Configuration */}
          <Card className="candy-glass-card">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">AI Configuration</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize AI fact generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
              <FormField
                control={form.control}
                name="aiModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">AI Model</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ai-model" className="h-10 sm:h-9">
                          <SelectValue placeholder="Select AI model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Choose the AI model for facts
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiPromptTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Custom Prompt (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Leave empty for default facts..."
                        className="min-h-20 sm:min-h-24 text-sm"
                        {...field}
                        data-testid="textarea-prompt-template"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Customize how facts are generated
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Chat Triggers */}
          <Card className="candy-glass-card">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Chat Triggers</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Viewer-triggered fact commands
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
              <FormField
                control={form.control}
                name="enableChatTriggers"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 sm:p-4 gap-3">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base">Chat Commands</FormLabel>
                      <FormDescription className="text-xs sm:text-sm">
                        Trigger facts via keywords
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-chat-triggers"
                        className="candy-touch-target"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chatKeywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Trigger Keywords</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="!snapple, !fact"
                        {...field}
                        value={field.value?.join(", ")}
                        onChange={(e) => {
                          const keywords = e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter((k) => k.length > 0);
                          field.onChange(keywords);
                        }}
                        data-testid="input-chat-keywords"
                        className="h-10 sm:h-9"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Comma-separated (e.g., !snapple, !fact)
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Active Platforms */}
          <Card className="candy-glass-card">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Active Platforms</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Select platforms for auto-posts
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <FormField
                control={form.control}
                name="activePlatforms"
                render={() => (
                  <FormItem>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {["twitch", "youtube", "kick"].map((platform) => (
                        <FormField
                          key={platform}
                          control={form.control}
                          name="activePlatforms"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 sm:space-x-3 space-y-0 p-2 sm:p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(platform)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    const updated = checked
                                      ? [...current, platform]
                                      : current.filter((p) => p !== platform);
                                    field.onChange(updated);
                                  }}
                                  data-testid={`checkbox-platform-${platform}`}
                                  className="candy-touch-target"
                                />
                              </FormControl>
                              <FormLabel className="font-normal capitalize cursor-pointer text-xs sm:text-sm">
                                {platform}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end sticky bottom-4 sm:static">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
              className="candy-button border-0 h-10 sm:h-9 w-full sm:w-auto candy-touch-target shadow-lg sm:shadow-none"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Save Settings</span>
            </Button>
          </div>
        </form>
      </Form>

      {/* Platform Connections */}
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">Platform Connections</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
            Connect streaming platforms for posting and overlays
          </p>
        </div>
        <TwitchCardMultiUser />
        <SpotifyCardMultiUser />
        <YouTubeCardMultiUser />
      </div>
    </div>
  );
}
