import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Save, Gamepad2, Trophy, Dices, Info } from "lucide-react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";

const gameSettingsSchema = z.object({
  enableGames: z.boolean(),
  enable8Ball: z.boolean(),
  enableTrivia: z.boolean(),
  enableDuel: z.boolean(),
  enableSlots: z.boolean(),
  enableRoulette: z.boolean(),
  cooldownMinutes: z.number().min(0).max(60),
  pointsPerWin: z.number().min(0).max(1000),
});

type GameSettingsFormValues = z.infer<typeof gameSettingsSchema>;

interface GameSettings {
  userId: string;
  enableGames: boolean;
  enable8Ball: boolean;
  enableTrivia: boolean;
  enableDuel: boolean;
  enableSlots: boolean;
  enableRoulette: boolean;
  cooldownMinutes: number;
  pointsPerWin: number;
  createdAt: string;
  updatedAt: string;
}

interface GameHistory {
  id: string;
  userId: string;
  gameType: string;
  player: string;
  outcome: string;
  pointsAwarded: number;
  platform: string;
  opponent?: string;
  details?: any;
  timestamp: string;
}

interface GameStats {
  gameType: string;
  totalPlays: number;
  wins: number;
  losses: number;
  neutral: number;
  totalPointsAwarded: number;
}

export default function Games() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<GameSettings>({
    queryKey: ["/api/games/settings"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<GameHistory[]>({
    queryKey: ["/api/games/history"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<GameStats[]>({
    queryKey: ["/api/games/stats"],
  });

  const form = useForm<GameSettingsFormValues>({
    resolver: zodResolver(gameSettingsSchema),
    defaultValues: {
      enableGames: true,
      enable8Ball: true,
      enableTrivia: true,
      enableDuel: true,
      enableSlots: true,
      enableRoulette: true,
      cooldownMinutes: 1,
      pointsPerWin: 10,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        enableGames: settings.enableGames,
        enable8Ball: settings.enable8Ball,
        enableTrivia: settings.enableTrivia,
        enableDuel: settings.enableDuel,
        enableSlots: settings.enableSlots,
        enableRoulette: settings.enableRoulette,
        cooldownMinutes: settings.cooldownMinutes,
        pointsPerWin: settings.pointsPerWin,
      });
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: GameSettingsFormValues) => {
      return await apiRequest("PATCH", "/api/games/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/settings"] });
      toast({
        title: "Settings saved",
        description: "Your game settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save game settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GameSettingsFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const getGameIcon = (gameType: string) => {
    switch (gameType) {
      case "8ball": return "🔮";
      case "trivia": return "🧠";
      case "duel": return "⚔️";
      case "slots": return "🎰";
      case "roulette": return "🎲";
      default: return "🎮";
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "win": return "text-green-600";
      case "loss": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const getWinRate = (stat: GameStats) => {
    if (stat.totalPlays === 0) return 0;
    return Math.round((stat.wins / stat.totalPlays) * 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Gamepad2 className="h-8 w-8" />
          Mini-Games System
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure and manage interactive chat games for your viewers
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Available Games</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 space-y-1 text-sm">
            <li><strong>!8ball &lt;question&gt;</strong> - AI-powered Magic 8-ball fortune teller</li>
            <li><strong>!trivia [difficulty]</strong> - Answer AI-generated trivia questions</li>
            <li><strong>!duel @user</strong> - Battle another viewer</li>
            <li><strong>!slots</strong> - Spin the slot machine for prizes</li>
            <li><strong>!roulette</strong> - Risk a timeout for points (1 in 6 chance)</li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Game Settings</CardTitle>
          <CardDescription>
            Configure global game settings and enable/disable individual games
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="enableGames"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable Games System</FormLabel>
                        <FormDescription>
                          Master switch for all mini-games
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="enable8Ball"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>🔮 Magic 8-Ball</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch("enableGames")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableTrivia"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>🧠 Trivia</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch("enableGames")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableDuel"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>⚔️ Duel</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch("enableGames")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableSlots"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>🎰 Slots</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch("enableGames")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableRoulette"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>🎲 Roulette</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!form.watch("enableGames")}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cooldownMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cooldown (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={60}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Time between game plays per user
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pointsPerWin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points per Win</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Points awarded for winning games
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                  className="w-full"
                >
                  {updateSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Game Statistics
          </CardTitle>
          <CardDescription>
            Overall performance across all games
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stats && stats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.map((stat) => (
                <Card key={stat.gameType}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="text-2xl">{getGameIcon(stat.gameType)}</span>
                      {stat.gameType.charAt(0).toUpperCase() + stat.gameType.slice(1)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Plays:</span>
                      <span className="font-medium">{stat.totalPlays}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Wins:</span>
                      <span className="font-medium text-green-600">{stat.wins}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Losses:</span>
                      <span className="font-medium text-red-600">{stat.losses}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Win Rate:</span>
                      <span className="font-medium">{getWinRate(stat)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Points Awarded:</span>
                      <span className="font-medium text-blue-600">{stat.totalPointsAwarded}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Dices className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No game statistics yet</p>
              <p className="text-sm">Stats will appear once viewers start playing!</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Games</CardTitle>
          <CardDescription>
            Latest 50 games played by your viewers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Opponent</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((game) => (
                    <TableRow key={game.id}>
                      <TableCell className="font-medium">
                        <span className="mr-2">{getGameIcon(game.gameType)}</span>
                        {game.gameType}
                      </TableCell>
                      <TableCell>{game.player}</TableCell>
                      <TableCell>{game.opponent || "-"}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${getOutcomeColor(game.outcome)}`}>
                          {game.outcome}
                        </span>
                      </TableCell>
                      <TableCell>{game.pointsAwarded}</TableCell>
                      <TableCell className="capitalize">{game.platform}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(game.timestamp), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Gamepad2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No games played yet</p>
              <p className="text-sm">Game history will appear here once viewers start playing!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
