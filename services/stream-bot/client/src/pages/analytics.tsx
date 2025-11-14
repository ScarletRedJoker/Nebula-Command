import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell,
  PieChart,
  Pie
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  Smile, 
  Frown, 
  Meh, 
  Users, 
  MessageSquare, 
  Calendar,
  Clock,
  Heart,
  Target,
  Activity,
  Sparkles
} from "lucide-react";

interface SentimentData {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  score: number;
  topics: Array<{ topic: string; count: number }>;
}

interface GrowthPrediction {
  metric: string;
  current: number;
  predicted30Days: number;
  predicted90Days: number;
  growthRate: number;
  confidence: number;
}

interface EngagementMetrics {
  avgMessagesPerMinute: number;
  avgViewerRetention: number;
  uniqueChattersGrowth: number;
  mostActiveHour: number;
  peakEngagementDay: string;
}

interface BestStreamingTime {
  dayOfWeek: number;
  hour: number;
  avgViewers: number;
  engagementScore: number;
}

interface HealthScore {
  overall: number;
  breakdown: {
    consistency: number;
    growth: number;
    engagement: number;
    sentiment: number;
  };
  recommendations: string[];
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Analytics() {
  const [sentimentDays, setSentimentDays] = useState<number>(30);

  // Fetch sentiment data
  const { data: sentimentData, isLoading: sentimentLoading } = useQuery<SentimentData[]>({
    queryKey: [`/api/analytics/sentiment?days=${sentimentDays}`],
  });

  // Fetch growth predictions
  const { data: growthPredictions, isLoading: growthLoading } = useQuery<GrowthPrediction[]>({
    queryKey: ["/api/analytics/growth"],
  });

  // Fetch engagement metrics
  const { data: engagementMetrics, isLoading: engagementLoading } = useQuery<EngagementMetrics>({
    queryKey: ["/api/analytics/engagement"],
  });

  // Fetch best streaming times
  const { data: bestTimes, isLoading: bestTimesLoading } = useQuery<BestStreamingTime[]>({
    queryKey: ["/api/analytics/best-times"],
  });

  // Fetch health score
  const { data: healthScore, isLoading: healthLoading } = useQuery<HealthScore>({
    queryKey: ["/api/analytics/health-score"],
  });

  // Prepare sentiment chart data
  const sentimentChartData = sentimentData?.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Positive: d.positive,
    Negative: d.negative,
    Neutral: d.neutral,
    Score: d.score
  })) || [];

  // Prepare growth chart data
  const growthChartData = growthPredictions?.map(p => ({
    metric: p.metric === 'avgViewers' ? 'Avg Viewers' : p.metric.charAt(0).toUpperCase() + p.metric.slice(1),
    Current: p.current,
    '30 Days': p.predicted30Days,
    '90 Days': p.predicted90Days
  })) || [];

  // Prepare heatmap data
  const heatmapData: Array<{ day: string; hour: number; value: number }> = [];
  if (bestTimes) {
    bestTimes.forEach(time => {
      heatmapData.push({
        day: DAYS_OF_WEEK[time.dayOfWeek],
        hour: time.hour,
        value: time.engagementScore
      });
    });
  }

  // Get top topics from most recent sentiment data
  const topTopics = sentimentData && sentimentData.length > 0
    ? sentimentData[sentimentData.length - 1].topics.slice(0, 10)
    : [];

  // Calculate sentiment distribution for pie chart
  const totalMessages = sentimentData?.reduce((sum, d) => sum + d.positive + d.negative + d.neutral, 0) || 0;
  const sentimentDistribution = sentimentData ? [
    { name: 'Positive', value: sentimentData.reduce((sum, d) => sum + d.positive, 0), color: '#22c55e' },
    { name: 'Neutral', value: sentimentData.reduce((sum, d) => sum + d.neutral, 0), color: '#94a3b8' },
    { name: 'Negative', value: sentimentData.reduce((sum, d) => sum + d.negative, 0), color: '#ef4444' }
  ] : [];

  // Get health score color
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getHealthBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Advanced Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered insights and growth predictions for your streaming channel
          </p>
        </div>
      </div>

      {/* Health Score Overview */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Streamer Health Score
          </CardTitle>
          <CardDescription>Overall channel health and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : healthScore ? (
            <div className="space-y-6">
              <div className="flex items-center gap-6">
                <div className={`text-6xl font-bold ${getHealthColor(healthScore.overall)}`}>
                  {healthScore.overall}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Consistency</span>
                      <span className="font-semibold">{healthScore.breakdown.consistency}/25</span>
                    </div>
                    <Progress value={(healthScore.breakdown.consistency / 25) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Growth</span>
                      <span className="font-semibold">{healthScore.breakdown.growth}/25</span>
                    </div>
                    <Progress value={(healthScore.breakdown.growth / 25) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Engagement</span>
                      <span className="font-semibold">{healthScore.breakdown.engagement}/25</span>
                    </div>
                    <Progress value={(healthScore.breakdown.engagement / 25) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Sentiment</span>
                      <span className="font-semibold">{healthScore.breakdown.sentiment}/25</span>
                    </div>
                    <Progress value={(healthScore.breakdown.sentiment / 25) * 100} className="h-2" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Recommendations
                </h3>
                <ul className="space-y-2">
                  {healthScore.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">{i + 1}</Badge>
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No health data available yet. Start streaming to generate insights!
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="sentiment" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sentiment">Sentiment Analysis</TabsTrigger>
          <TabsTrigger value="growth">Growth Predictions</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="schedule">Best Times</TabsTrigger>
        </TabsList>

        {/* Sentiment Analysis Tab */}
        <TabsContent value="sentiment" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sentiment Trend Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Sentiment Trend
                    </CardTitle>
                    <CardDescription>Chat sentiment analysis over time</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={sentimentDays === 7 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSentimentDays(7)}
                    >
                      7D
                    </Button>
                    <Button
                      variant={sentimentDays === 30 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSentimentDays(30)}
                    >
                      30D
                    </Button>
                    <Button
                      variant={sentimentDays === 90 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSentimentDays(90)}
                    >
                      90D
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sentimentLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : sentimentChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={sentimentChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="Positive" 
                        stroke="#22c55e" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Neutral" 
                        stroke="#94a3b8" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Negative" 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    No sentiment data available yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sentiment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Overall Sentiment Distribution</CardTitle>
                <CardDescription>Total message breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {sentimentLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : sentimentDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={sentimentDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {sentimentDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Topics */}
            <Card>
              <CardHeader>
                <CardTitle>Top Chat Topics</CardTitle>
                <CardDescription>Most discussed topics in recent chats</CardDescription>
              </CardHeader>
              <CardContent>
                {sentimentLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : topTopics.length > 0 ? (
                  <div className="space-y-2">
                    {topTopics.map((topic, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{i + 1}</Badge>
                          <span className="font-medium">{topic.topic}</span>
                        </div>
                        <Badge>{topic.count} mentions</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    No topic data available yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Growth Predictions Tab */}
        <TabsContent value="growth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Growth Predictions
              </CardTitle>
              <CardDescription>
                AI-powered predictions based on historical data and linear regression
              </CardDescription>
            </CardHeader>
            <CardContent>
              {growthLoading ? (
                <Skeleton className="h-96 w-full" />
              ) : growthChartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={growthChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Current" fill="#3b82f6" />
                      <Bar dataKey="30 Days" fill="#10b981" />
                      <Bar dataKey="90 Days" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    {growthPredictions?.map((pred, i) => (
                      <Card key={i} className="border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">
                            {pred.metric === 'avgViewers' ? 'Average Viewers' : 
                             pred.metric.charAt(0).toUpperCase() + pred.metric.slice(1)}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Current</span>
                            <span className="font-semibold">{pred.current}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">30 Days</span>
                            <span className="font-semibold text-green-600">
                              {pred.predicted30Days}
                              {pred.growthRate > 0 && (
                                <TrendingUp className="inline ml-1 h-3 w-3" />
                              )}
                              {pred.growthRate < 0 && (
                                <TrendingDown className="inline ml-1 h-3 w-3" />
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">90 Days</span>
                            <span className="font-semibold text-purple-600">
                              {pred.predicted90Days}
                            </span>
                          </div>
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Confidence</span>
                              <Badge variant="outline">{pred.confidence}%</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-16">
                  Not enough data for predictions yet. Need at least 7 days of streaming data.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Messages/Min
                </CardTitle>
              </CardHeader>
              <CardContent>
                {engagementLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {engagementMetrics?.avgMessagesPerMinute || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Viewer Retention
                </CardTitle>
              </CardHeader>
              <CardContent>
                {engagementLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {engagementMetrics?.avgViewerRetention.toFixed(1) || 0}%
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Most Active Hour
                </CardTitle>
              </CardHeader>
              <CardContent>
                {engagementLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {engagementMetrics?.mostActiveHour || 0}:00
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Peak Day
                </CardTitle>
              </CardHeader>
              <CardContent>
                {engagementLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {engagementMetrics?.peakEngagementDay || 'N/A'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Chatter Growth</CardTitle>
              <CardDescription>Unique chatters growth rate</CardDescription>
            </CardHeader>
            <CardContent>
              {engagementLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : engagementMetrics ? (
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-bold ${
                    engagementMetrics.uniqueChattersGrowth > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {engagementMetrics.uniqueChattersGrowth > 0 ? '+' : ''}
                    {engagementMetrics.uniqueChattersGrowth.toFixed(1)}%
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-sm">
                      {engagementMetrics.uniqueChattersGrowth > 0
                        ? 'Your chat is growing! Keep engaging with your community.'
                        : 'Focus on community engagement to increase active chatters.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No engagement data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Best Streaming Times Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Optimal Streaming Schedule
              </CardTitle>
              <CardDescription>
                Best times to stream based on viewer engagement and historical data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bestTimesLoading ? (
                <Skeleton className="h-96 w-full" />
              ) : bestTimes && bestTimes.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map((day, dayIndex) => (
                      <div key={day} className="text-center">
                        <div className="font-semibold text-xs mb-2">{day.slice(0, 3)}</div>
                        <div className="space-y-1">
                          {Array.from({ length: 24 }, (_, hour) => {
                            const timeData = bestTimes.find(
                              t => t.dayOfWeek === dayIndex && t.hour === hour
                            );
                            const intensity = timeData 
                              ? Math.min(100, (timeData.engagementScore / Math.max(...bestTimes.map(t => t.engagementScore))) * 100)
                              : 0;
                            
                            return (
                              <div
                                key={hour}
                                className="h-2 rounded-sm"
                                style={{
                                  backgroundColor: intensity > 0
                                    ? `rgba(34, 197, 94, ${intensity / 100})`
                                    : '#f1f5f9'
                                }}
                                title={timeData 
                                  ? `${hour}:00 - ${timeData.avgViewers} avg viewers`
                                  : `${hour}:00 - No data`
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Top 10 Best Time Slots</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {bestTimes.slice(0, 10).map((time, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{i + 1}</Badge>
                            <div>
                              <div className="font-medium">
                                {DAYS_OF_WEEK[time.dayOfWeek]} at {time.hour}:00
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Avg {time.avgViewers} viewers
                              </div>
                            </div>
                          </div>
                          <Badge variant="secondary">
                            Score: {time.engagementScore}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-16">
                  Not enough streaming data to calculate best times yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
