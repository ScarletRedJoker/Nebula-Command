import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";
import { 
  TrendingUp, Users, Clock, Star, BarChart3, Calendar, 
  CheckCircle, AlertCircle, Timer, Award, ThumbsUp
} from "lucide-react";

interface StaffMetric {
  staffId: string;
  staffUsername: string;
  ticketsHandled: number;
  ticketsClosed: number;
  resolutionRate: number;
  avgResponseTimeMinutes: number | null;
  avgResolutionTimeMinutes: number | null;
  avgSatisfactionRating: number | null;
}

interface StaffPerformanceData {
  staffMetrics: StaffMetric[];
  summary: {
    totalTickets: number;
    openTickets: number;
    closedTickets: number;
    pendingTickets: number;
    overallSatisfaction: string | null;
  };
  periodDays: number;
}

interface TicketTrendsData {
  dailyTrends: Array<{ date: string; ticketsCreated: number; ticketsClosed: number }>;
  categoryBreakdown: Array<{ categoryId: number; categoryName: string; categoryEmoji: string; ticketCount: number; avgSatisfaction: number | null }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
  dayOfWeekDistribution: Array<{ dayOfWeek: number; dayName: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  periodDays: number;
}

interface SatisfactionData {
  trends: Array<{ date: string; avgRating: string; ratingCount: number }>;
  ratingDistribution: Array<{ rating: number; count: number }>;
  categorySatisfaction: Array<{ categoryId: number; categoryName: string; categoryEmoji: string; avgRating: string; ratingCount: number }>;
  summary: {
    overallAverage: string | null;
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    positiveRate: string | null;
  };
  periodDays: number;
}

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#ED4245', '#EB459E', '#9B59B6', '#3498DB', '#1ABC9C'];
const STATUS_COLORS: Record<string, string> = {
  open: '#57F287',
  closed: '#5865F2',
  pending: '#FEE75C',
};

function formatTime(minutes: number | null): string {
  if (minutes === null) return 'N/A';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="bg-discord-sidebar border-discord-dark">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-discord-muted">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {subtitle && <p className="text-xs text-discord-muted mt-1">{subtitle}</p>}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            trend === 'up' ? 'bg-green-500/20 text-green-400' :
            trend === 'down' ? 'bg-red-500/20 text-red-400' :
            'bg-discord-blue/20 text-discord-blue'
          }`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffLeaderboard({ metrics }: { metrics: StaffMetric[] }) {
  if (metrics.length === 0) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-discord-blue" />
            Staff Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-discord-muted text-center py-8">No staff performance data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-discord-sidebar border-discord-dark">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Award className="h-5 w-5 text-discord-blue" />
          Staff Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.slice(0, 10).map((staff, index) => (
            <div key={staff.staffId} className="flex items-center justify-between p-3 bg-discord-dark rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                  index === 0 ? 'bg-yellow-500' :
                  index === 1 ? 'bg-gray-400' :
                  index === 2 ? 'bg-amber-700' :
                  'bg-discord-blue'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <p className="text-white font-medium">{staff.staffUsername}</p>
                  <p className="text-xs text-discord-muted">{staff.ticketsHandled} tickets handled</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <p className="text-discord-muted text-xs">Resolution</p>
                  <p className="text-white font-medium">{staff.resolutionRate}%</p>
                </div>
                <div className="text-center">
                  <p className="text-discord-muted text-xs">Avg Response</p>
                  <p className="text-white font-medium">{formatTime(staff.avgResponseTimeMinutes)}</p>
                </div>
                {staff.avgSatisfactionRating && (
                  <div className="text-center">
                    <p className="text-discord-muted text-xs">Rating</p>
                    <p className="text-yellow-400 font-medium flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400" />
                      {staff.avgSatisfactionRating.toFixed(1)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsTab() {
  const { selectedServerId } = useServerContext();
  const [timeRange, setTimeRange] = useState("30");
  const [activeSubTab, setActiveSubTab] = useState("overview");

  const { data: staffData, isLoading: staffLoading } = useQuery<StaffPerformanceData>({
    queryKey: ['/api/analytics/staff-performance', selectedServerId, timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/staff-performance?serverId=${selectedServerId}&days=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch staff performance');
      return res.json();
    },
    enabled: !!selectedServerId,
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery<TicketTrendsData>({
    queryKey: ['/api/analytics/ticket-trends', selectedServerId, timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/ticket-trends?serverId=${selectedServerId}&days=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch ticket trends');
      return res.json();
    },
    enabled: !!selectedServerId,
  });

  const { data: satisfactionData, isLoading: satisfactionLoading } = useQuery<SatisfactionData>({
    queryKey: ['/api/analytics/satisfaction', selectedServerId, timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/satisfaction?serverId=${selectedServerId}&days=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch satisfaction data');
      return res.json();
    },
    enabled: !!selectedServerId,
  });

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-discord-muted mb-4" />
          <h3 className="text-lg font-medium text-white">Select a Server</h3>
          <p className="text-discord-muted mt-2">Choose a server from the dropdown to view analytics</p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = staffLoading || trendsLoading || satisfactionLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-discord-blue" />
            Analytics Dashboard
          </h2>
          <p className="text-sm text-discord-muted mt-1">
            Performance metrics and ticket insights
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40 bg-discord-dark border-discord-dark text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-discord-dark border-discord-dark">
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-discord-sidebar border-discord-dark">
              <CardContent className="p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-discord-dark rounded w-1/2" />
                  <div className="h-8 bg-discord-dark rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Tickets"
              value={staffData?.summary.totalTickets || 0}
              subtitle={`Last ${timeRange} days`}
              icon={BarChart3}
            />
            <StatCard
              title="Open Tickets"
              value={staffData?.summary.openTickets || 0}
              icon={AlertCircle}
              trend={staffData?.summary.openTickets && staffData.summary.openTickets > 10 ? 'down' : 'neutral'}
            />
            <StatCard
              title="Closed Tickets"
              value={staffData?.summary.closedTickets || 0}
              icon={CheckCircle}
              trend="up"
            />
            <StatCard
              title="Avg Satisfaction"
              value={staffData?.summary.overallSatisfaction ? `${staffData.summary.overallSatisfaction}/5` : 'N/A'}
              icon={Star}
              trend={staffData?.summary.overallSatisfaction && parseFloat(staffData.summary.overallSatisfaction) >= 4 ? 'up' : 'neutral'}
            />
          </div>

          <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
            <TabsList className="bg-discord-dark border-discord-dark">
              <TabsTrigger value="overview" className="data-[state=active]:bg-discord-blue">
                <TrendingUp className="h-4 w-4 mr-2" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="staff" className="data-[state=active]:bg-discord-blue">
                <Users className="h-4 w-4 mr-2" />
                Staff
              </TabsTrigger>
              <TabsTrigger value="satisfaction" className="data-[state=active]:bg-discord-blue">
                <Star className="h-4 w-4 mr-2" />
                Satisfaction
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Ticket Volume Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendsData?.dailyTrends || []}>
                          <defs>
                            <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#5865F2" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#5865F2" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#57F287" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#57F287" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#72767d" 
                            tick={{ fill: '#72767d', fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          />
                          <YAxis stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                            labelStyle={{ color: '#ffffff' }}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="ticketsCreated" name="Created" stroke="#5865F2" fill="url(#colorCreated)" />
                          <Area type="monotone" dataKey="ticketsClosed" name="Closed" stroke="#57F287" fill="url(#colorClosed)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Status Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={trendsData?.statusDistribution || []}
                            dataKey="count"
                            nameKey="status"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ status, percent }) => `${status} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {trendsData?.statusDistribution?.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Tickets by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendsData?.categoryBreakdown || []} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                          <XAxis type="number" stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                          <YAxis 
                            type="category" 
                            dataKey="categoryName" 
                            stroke="#72767d" 
                            tick={{ fill: '#72767d', fontSize: 12 }}
                            width={120}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                          />
                          <Bar dataKey="ticketCount" name="Tickets" fill="#5865F2" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Peak Hours</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendsData?.hourlyDistribution || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                          <XAxis 
                            dataKey="hour" 
                            stroke="#72767d" 
                            tick={{ fill: '#72767d', fontSize: 12 }}
                            tickFormatter={(value) => `${value}:00`}
                          />
                          <YAxis stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                            labelFormatter={(value) => `${value}:00 - ${value}:59`}
                          />
                          <Bar dataKey="count" name="Tickets" fill="#EB459E" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Tickets by Day of Week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendsData?.dayOfWeekDistribution || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                        <XAxis dataKey="dayName" stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                        <YAxis stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                        />
                        <Bar dataKey="count" name="Tickets" fill="#FEE75C" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staff" className="mt-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Active Staff"
                  value={staffData?.staffMetrics.length || 0}
                  icon={Users}
                />
                <StatCard
                  title="Avg Response Time"
                  value={staffData?.staffMetrics.length 
                    ? formatTime(staffData.staffMetrics.reduce((acc, s) => acc + (s.avgResponseTimeMinutes || 0), 0) / staffData.staffMetrics.length)
                    : 'N/A'}
                  icon={Timer}
                />
                <StatCard
                  title="Avg Resolution Time"
                  value={staffData?.staffMetrics.length 
                    ? formatTime(staffData.staffMetrics.reduce((acc, s) => acc + (s.avgResolutionTimeMinutes || 0), 0) / staffData.staffMetrics.length)
                    : 'N/A'}
                  icon={Clock}
                />
                <StatCard
                  title="Total Closed"
                  value={staffData?.staffMetrics.reduce((acc, s) => acc + s.ticketsClosed, 0) || 0}
                  icon={CheckCircle}
                  trend="up"
                />
              </div>

              <StaffLeaderboard metrics={staffData?.staffMetrics || []} />

              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Staff Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={staffData?.staffMetrics.slice(0, 10) || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                        <XAxis dataKey="staffUsername" stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                        <YAxis stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="ticketsHandled" name="Handled" fill="#5865F2" />
                        <Bar dataKey="ticketsClosed" name="Closed" fill="#57F287" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="satisfaction" className="mt-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Overall Rating"
                  value={satisfactionData?.summary.overallAverage ? `${satisfactionData.summary.overallAverage}/5` : 'N/A'}
                  icon={Star}
                  trend={satisfactionData?.summary.overallAverage && parseFloat(satisfactionData.summary.overallAverage) >= 4 ? 'up' : 'neutral'}
                />
                <StatCard
                  title="Total Ratings"
                  value={satisfactionData?.summary.totalRatings || 0}
                  icon={ThumbsUp}
                />
                <StatCard
                  title="Positive Rate"
                  value={satisfactionData?.summary.positiveRate ? `${satisfactionData.summary.positiveRate}%` : 'N/A'}
                  subtitle="4-5 star ratings"
                  icon={TrendingUp}
                  trend="up"
                />
                <StatCard
                  title="Needs Improvement"
                  value={satisfactionData?.summary.negativeRatings || 0}
                  subtitle="1-2 star ratings"
                  icon={AlertCircle}
                  trend={satisfactionData?.summary.negativeRatings && satisfactionData.summary.negativeRatings > 5 ? 'down' : 'neutral'}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Satisfaction Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={satisfactionData?.trends || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#72767d" 
                            tick={{ fill: '#72767d', fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          />
                          <YAxis domain={[0, 5]} stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="avgRating" 
                            name="Avg Rating" 
                            stroke="#FEE75C" 
                            strokeWidth={2}
                            dot={{ fill: '#FEE75C' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-discord-sidebar border-discord-dark">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Rating Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={satisfactionData?.ratingDistribution || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#40444b" />
                          <XAxis 
                            dataKey="rating" 
                            stroke="#72767d" 
                            tick={{ fill: '#72767d', fontSize: 12 }}
                            tickFormatter={(value) => `${value} ⭐`}
                          />
                          <YAxis stroke="#72767d" tick={{ fill: '#72767d', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#2f3136', border: '1px solid #40444b', borderRadius: '8px' }}
                          />
                          <Bar dataKey="count" name="Ratings">
                            {satisfactionData?.ratingDistribution?.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.rating >= 4 ? '#57F287' : entry.rating === 3 ? '#FEE75C' : '#ED4245'} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-discord-sidebar border-discord-dark">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Satisfaction by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  {satisfactionData?.categorySatisfaction && satisfactionData.categorySatisfaction.length > 0 ? (
                    <div className="space-y-4">
                      {satisfactionData.categorySatisfaction.map((cat) => (
                        <div key={cat.categoryId} className="flex items-center justify-between p-3 bg-discord-dark rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{cat.categoryEmoji}</span>
                            <div>
                              <p className="text-white font-medium">{cat.categoryName}</p>
                              <p className="text-xs text-discord-muted">{cat.ratingCount} ratings</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Star className={`h-5 w-5 ${parseFloat(cat.avgRating) >= 4 ? 'text-yellow-400 fill-yellow-400' : 'text-discord-muted'}`} />
                            <span className="text-xl font-bold text-white">{cat.avgRating}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-discord-muted text-center py-8">No category satisfaction data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
