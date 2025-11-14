import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Send, Info, TrendingUp, Radio } from "lucide-react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";

const shoutoutSettingsSchema = z.object({
  shoutoutTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  enableAutoShoutouts: z.boolean(),
  enableRaidShoutouts: z.boolean(),
  enableHostShoutouts: z.boolean(),
  recentFollowerShoutouts: z.boolean(),
});

type ShoutoutSettingsFormValues = z.infer<typeof shoutoutSettingsSchema>;

interface ShoutoutSettings {
  id: string;
  userId: string;
  enableAutoShoutouts: boolean;
  shoutoutTemplate: string;
  enableRaidShoutouts: boolean;
  enableHostShoutouts: boolean;
  recentFollowerShoutouts: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ShoutoutHistory {
  id: string;
  userId: string;
  targetUsername: string;
  platform: string;
  shoutoutType: string;
  message: string;
  timestamp: string;
}

export default function Shoutouts() {
  const { toast } = useToast();
  const [manualTarget, setManualTarget] = useState("");
  const [manualPlatform, setManualPlatform] = useState("twitch");

  const { data: settings, isLoading: settingsLoading } = useQuery<ShoutoutSettings>({
    queryKey: ["/api/shoutouts/settings"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<ShoutoutHistory[]>({
    queryKey: ["/api/shoutouts/history"],
  });

  const form = useForm<ShoutoutSettingsFormValues>({
    resolver: zodResolver(shoutoutSettingsSchema),
    defaultValues: {
      shoutoutTemplate: "Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}",
      enableAutoShoutouts: false,
      enableRaidShoutouts: false,
      enableHostShoutouts: false,
      recentFollowerShoutouts: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        shoutoutTemplate: settings.shoutoutTemplate,
        enableAutoShoutouts: settings.enableAutoShoutouts,
        enableRaidShoutouts: settings.enableRaidShoutouts,
        enableHostShoutouts: settings.enableHostShoutouts,
        recentFollowerShoutouts: settings.recentFollowerShoutouts,
      });
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: ShoutoutSettingsFormValues) => {
      return await apiRequest("PATCH", "/api/shoutouts/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shoutouts/settings"] });
      toast({
        title: "Settings saved",
        description: "Your shoutout settings have been updated successfully.",
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

  const manualShoutoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/shoutouts", {
        targetUsername: manualTarget,
        platform: manualPlatform,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shoutouts/history"] });
      toast({
        title: "Shoutout sent!",
        description: data.message || `Successfully shouted out ${manualTarget}`,
      });
      setManualTarget("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send shoutout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmitSettings = (data: ShoutoutSettingsFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const handleManualShoutout = () => {
    if (!manualTarget.trim()) {
      toast({
        title: "Error",
        description: "Please enter a username to shoutout.",
        variant: "destructive",
      });
      return;
    }
    manualShoutoutMutation.mutate();
  };

  const insertVariable = (variable: string) => {
    const currentTemplate = form.getValues("shoutoutTemplate");
    form.setValue("shoutoutTemplate", currentTemplate + ` {${variable}}`);
  };

  if (settingsLoading) {
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Shoutouts</h1>
        <p className="text-muted-foreground">
          Manage shoutout settings and give shoutouts to other streamers
        </p>
      </div>

      {/* Manual Shoutout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Manual Shoutout
          </CardTitle>
          <CardDescription>
            Manually shoutout another streamer right now
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="manual-target">Username</Label>
              <Input
                id="manual-target"
                placeholder="Enter username to shoutout"
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
              />
            </div>
            <div className="w-48">
              <Label htmlFor="manual-platform">Platform</Label>
              <Select
                value={manualPlatform}
                onValueChange={setManualPlatform}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="twitch">Twitch</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="kick">Kick</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleManualShoutout}
                disabled={manualShoutoutMutation.isPending}
              >
                {manualShoutoutMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send Shoutout
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shoutout Settings</CardTitle>
              <CardDescription>
                Configure how shoutouts work in your stream
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template Editor */}
              <FormField
                control={form.control}
                name="shoutoutTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shoutout Template</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}"
                        className="min-h-[100px]"
                      />
                    </FormControl>
                    <FormDescription>
                      Customize your shoutout message. Available variables: {"{username}"}, {"{game}"}, {"{viewers}"}, {"{url}"}, {"{title}"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable("username")}
                >
                  Insert {"{username}"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable("game")}
                >
                  Insert {"{game}"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable("viewers")}
                >
                  Insert {"{viewers}"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable("url")}
                >
                  Insert {"{url}"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertVariable("title")}
                >
                  Insert {"{title}"}
                </Button>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Bot Commands</AlertTitle>
                <AlertDescription>
                  Your viewers and mods can use <code className="px-1 py-0.5 bg-muted rounded">!so username</code> or{" "}
                  <code className="px-1 py-0.5 bg-muted rounded">!shoutout username</code> to trigger shoutouts in chat
                </AlertDescription>
              </Alert>

              {/* Auto-Shoutout Toggles */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Auto-Shoutout Options</h3>
                
                <FormField
                  control={form.control}
                  name="enableAutoShoutouts"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable Auto-Shoutouts</FormLabel>
                        <FormDescription>
                          Automatically send shoutouts based on events
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enableRaidShoutouts"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          Raid Shoutouts
                        </FormLabel>
                        <FormDescription>
                          Automatically shoutout raiders when they raid your channel
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enableHostShoutouts"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Host Shoutouts
                        </FormLabel>
                        <FormDescription>
                          Automatically shoutout when someone hosts your channel
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recentFollowerShoutouts"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Recent Follower Shoutouts</FormLabel>
                        <FormDescription>
                          Shoutout new followers (experimental feature)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                >
                  {updateSettingsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      {/* Shoutout History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Shoutouts</CardTitle>
          <CardDescription>
            History of shoutouts sent from your channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              No shoutouts sent yet. Try sending a manual shoutout above!
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">@{item.targetUsername}</TableCell>
                      <TableCell>
                        <span className="capitalize">{item.platform}</span>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-sm text-muted-foreground">
                          {item.shoutoutType}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {item.message}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
