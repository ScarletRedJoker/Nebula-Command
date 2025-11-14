import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Trophy, Clock, Users, Plus, X, Play, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Poll = {
  id: number;
  userId: string;
  question: string;
  options: string[];
  platform: string;
  durationSeconds: number;
  status: "active" | "ended";
  startedAt: string | null;
  endedAt: string | null;
  totalVotes: number;
  createdAt: string;
};

type PollVote = {
  option: string;
  votes: number;
  percentage: number;
};

type Prediction = {
  id: number;
  userId: string;
  title: string;
  outcomes: string[];
  platform: string;
  durationSeconds: number;
  status: "active" | "locked" | "resolved";
  startedAt: string | null;
  endedAt: string | null;
  winningOutcome: string | null;
  totalBets: number;
  createdAt: string;
};

type PredictionBet = {
  outcome: string;
  bets: number;
  totalAmount: number;
  percentage: number;
};

export default function Polls() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"polls" | "predictions">("polls");
  
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState("120");
  const [pollPlatform, setPollPlatform] = useState("twitch");
  
  const [predictionTitle, setPredictionTitle] = useState("");
  const [predictionOutcomes, setPredictionOutcomes] = useState(["", ""]);
  const [predictionDuration, setPredictionDuration] = useState("300");
  const [predictionPlatform, setPredictionPlatform] = useState("twitch");

  const { data: activePoll, isLoading: activePollLoading } = useQuery<Poll | null>({
    queryKey: ["/api/polls/active", pollPlatform],
    refetchInterval: 3000,
  });

  const { data: activePrediction, isLoading: activePredictionLoading } = useQuery<Prediction | null>({
    queryKey: ["/api/predictions/active", predictionPlatform],
    refetchInterval: 3000,
  });

  const { data: pollHistory } = useQuery<Poll[]>({
    queryKey: ["/api/polls"],
  });

  const { data: predictionHistory } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions"],
  });

  const { data: pollResults } = useQuery<{ votes: PollVote[] }>({
    queryKey: [`/api/polls/${activePoll?.id}/results`],
    enabled: !!activePoll,
    refetchInterval: 3000,
  });

  const { data: predictionResults } = useQuery<{ bets: PredictionBet[] }>({
    queryKey: [`/api/predictions/${activePrediction?.id}/results`],
    enabled: !!activePrediction,
    refetchInterval: 3000,
  });

  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === "poll_update" || data.type === "prediction_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/polls/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
    }
  }, []);

  useWebSocket(handleWebSocketMessage);

  const createPollMutation = useMutation({
    mutationFn: async () => {
      const validOptions = pollOptions.filter(opt => opt.trim() !== "");
      if (validOptions.length < 2) {
        throw new Error("At least 2 options are required");
      }
      return await apiRequest("POST", "/api/polls", {
        question: pollQuestion,
        options: validOptions,
        durationSeconds: parseInt(pollDuration),
        platform: pollPlatform,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDuration("120");
      toast({
        title: "Poll Created!",
        description: "Your poll is now live in chat.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Poll",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const createPredictionMutation = useMutation({
    mutationFn: async () => {
      const validOutcomes = predictionOutcomes.filter(opt => opt.trim() !== "");
      if (validOutcomes.length < 2) {
        throw new Error("At least 2 outcomes are required");
      }
      return await apiRequest("POST", "/api/predictions", {
        title: predictionTitle,
        outcomes: validOutcomes,
        durationSeconds: parseInt(predictionDuration),
        platform: predictionPlatform,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      setPredictionTitle("");
      setPredictionOutcomes(["", ""]);
      setPredictionDuration("300");
      toast({
        title: "Prediction Created!",
        description: "Your prediction is now live for betting.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Prediction",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const endPollMutation = useMutation({
    mutationFn: async (pollId: number) => {
      return await apiRequest("POST", `/api/polls/${pollId}/end`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polls/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/polls"] });
      toast({
        title: "Poll Ended",
        description: "Results have been announced in chat.",
      });
    },
  });

  const resolvePredictionMutation = useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: string }) => {
      return await apiRequest("POST", `/api/predictions/${id}/resolve`, {
        winningOutcome: outcome,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      toast({
        title: "Prediction Resolved",
        description: "Winners have been paid out!",
      });
    },
  });

  const addPollOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, ""]);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const addPredictionOutcome = () => {
    if (predictionOutcomes.length < 10) {
      setPredictionOutcomes([...predictionOutcomes, ""]);
    }
  };

  const removePredictionOutcome = (index: number) => {
    if (predictionOutcomes.length > 2) {
      setPredictionOutcomes(predictionOutcomes.filter((_, i) => i !== index));
    }
  };

  const updatePredictionOutcome = (index: number, value: string) => {
    const newOutcomes = [...predictionOutcomes];
    newOutcomes[index] = value;
    setPredictionOutcomes(newOutcomes);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Polls & Predictions</h1>
        <p className="text-muted-foreground">
          Create polls for your viewers to vote on and predictions for them to bet points on.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "polls" | "predictions")}>
        <TabsList className="mb-6">
          <TabsTrigger value="polls" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Polls
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Predictions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="polls" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create New Poll</CardTitle>
                <CardDescription>Ask your viewers a question with multiple choice options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="poll-question">Question</Label>
                  <Input
                    id="poll-question"
                    placeholder="What game should we play next?"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Options</Label>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={`Option ${index + 1}`}
                        value={option}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                      />
                      {pollOptions.length > 2 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removePollOption(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <Button variant="outline" size="sm" onClick={addPollOption} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Option
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="poll-duration">Duration (seconds)</Label>
                    <Input
                      id="poll-duration"
                      type="number"
                      min="30"
                      max="600"
                      value={pollDuration}
                      onChange={(e) => setPollDuration(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="poll-platform">Platform</Label>
                    <Select value={pollPlatform} onValueChange={setPollPlatform}>
                      <SelectTrigger id="poll-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="twitch">Twitch</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createPollMutation.mutate()}
                  disabled={!pollQuestion || pollOptions.filter(o => o).length < 2 || createPollMutation.isPending || !!activePoll}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {activePoll ? "Poll Already Active" : "Start Poll"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Active Poll
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activePollLoading ? (
                  <div className="text-center text-muted-foreground py-8">Loading...</div>
                ) : activePoll ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg">{activePoll.question}</h3>
                        <Badge variant={activePoll.status === "active" ? "default" : "secondary"}>
                          {activePoll.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {activePoll.totalVotes} votes
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {pollDuration}s
                        </span>
                      </div>
                    </div>

                    {pollResults && (
                      <div className="space-y-3">
                        {pollResults.votes.map((vote, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{vote.option}</span>
                              <span className="text-muted-foreground">
                                {vote.votes} ({vote.percentage}%)
                              </span>
                            </div>
                            <Progress value={vote.percentage} />
                          </div>
                        ))}
                      </div>
                    )}

                    {activePoll.status === "active" && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => endPollMutation.mutate(activePoll.id)}
                        disabled={endPollMutation.isPending}
                      >
                        End Poll Now
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No active poll. Create one to get started!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Poll History</CardTitle>
            </CardHeader>
            <CardContent>
              {pollHistory && pollHistory.length > 0 ? (
                <div className="space-y-3">
                  {pollHistory.slice(0, 10).map((poll) => (
                    <div
                      key={poll.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{poll.question}</p>
                        <p className="text-sm text-muted-foreground">
                          {poll.totalVotes} votes · {new Date(poll.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={poll.status === "active" ? "default" : "secondary"}>
                        {poll.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No poll history yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create New Prediction</CardTitle>
                <CardDescription>Let viewers bet points on different outcomes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prediction-title">Title</Label>
                  <Input
                    id="prediction-title"
                    placeholder="Will we win this match?"
                    value={predictionTitle}
                    onChange={(e) => setPredictionTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Outcomes</Label>
                  {predictionOutcomes.map((outcome, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={`Outcome ${index + 1}`}
                        value={outcome}
                        onChange={(e) => updatePredictionOutcome(index, e.target.value)}
                      />
                      {predictionOutcomes.length > 2 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removePredictionOutcome(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {predictionOutcomes.length < 10 && (
                    <Button variant="outline" size="sm" onClick={addPredictionOutcome} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Outcome
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prediction-duration">Duration (seconds)</Label>
                    <Input
                      id="prediction-duration"
                      type="number"
                      min="60"
                      max="1800"
                      value={predictionDuration}
                      onChange={(e) => setPredictionDuration(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="prediction-platform">Platform</Label>
                    <Select value={predictionPlatform} onValueChange={setPredictionPlatform}>
                      <SelectTrigger id="prediction-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="twitch">Twitch</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createPredictionMutation.mutate()}
                  disabled={!predictionTitle || predictionOutcomes.filter(o => o).length < 2 || createPredictionMutation.isPending || !!activePrediction}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {activePrediction ? "Prediction Already Active" : "Start Prediction"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Active Prediction
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activePredictionLoading ? (
                  <div className="text-center text-muted-foreground py-8">Loading...</div>
                ) : activePrediction ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg">{activePrediction.title}</h3>
                        <Badge variant={activePrediction.status === "active" ? "default" : activePrediction.status === "locked" ? "secondary" : "outline"}>
                          {activePrediction.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {activePrediction.totalBets} bets
                        </span>
                      </div>
                    </div>

                    {predictionResults && (
                      <div className="space-y-3">
                        {predictionResults.bets.map((bet, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{bet.outcome}</span>
                              <span className="text-muted-foreground">
                                {bet.totalAmount} pts ({bet.percentage}%)
                              </span>
                            </div>
                            <Progress value={bet.percentage} />
                          </div>
                        ))}
                      </div>
                    )}

                    {activePrediction.status === "active" && (
                      <div className="space-y-2">
                        <Label>Resolve with Winner</Label>
                        {activePrediction.outcomes.map((outcome) => (
                          <Button
                            key={outcome}
                            variant="outline"
                            className="w-full"
                            onClick={() => resolvePredictionMutation.mutate({ id: activePrediction.id, outcome })}
                            disabled={resolvePredictionMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {outcome}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No active prediction. Create one to get started!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Prediction History</CardTitle>
            </CardHeader>
            <CardContent>
              {predictionHistory && predictionHistory.length > 0 ? (
                <div className="space-y-3">
                  {predictionHistory.slice(0, 10).map((prediction) => (
                    <div
                      key={prediction.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{prediction.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {prediction.totalBets} bets
                          {prediction.winningOutcome && ` · Winner: ${prediction.winningOutcome}`}
                          {" · "}
                          {new Date(prediction.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={prediction.status === "resolved" ? "outline" : "default"}>
                        {prediction.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No prediction history yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
