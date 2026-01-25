'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  Cpu, 
  Cloud, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Zap,
  Database,
  Settings
} from 'lucide-react';

interface CostSummary {
  dailySpend: number;
  dailyLimit: number;
  remainingBudget: number;
  percentUsed: number;
  isOverLimit: boolean;
  isNearLimit: boolean;
  localOnlyMode: boolean;
  byProvider: Record<string, { cost: number; requests: number }>;
  byModel: Record<string, { cost: number; requests: number }>;
  lastUpdated: Date;
}

interface DailyStats {
  date: string;
  totalCost: number;
  totalRequests: number;
}

export default function AIUsagePage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [cacheStats, setCacheStats] = useState<{ size: number; hits: number; misses: number; hitRate: number } | null>(null);
  const [optimizerStats, setOptimizerStats] = useState<{ requestCount: number; tokensSaved: number; estimatedSavings: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [localOnlyMode, setLocalOnlyMode] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('5');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/ai/costs');
      const data = await response.json();

      if (data.success) {
        setSummary(data.data.summary);
        setDailyStats(data.data.stats);
        setCacheStats(data.data.cache || { size: 0, hits: 0, misses: 0, hitRate: 0 });
        setOptimizerStats(data.data.optimizer || { requestCount: 0, tokensSaved: 0, estimatedSavings: 0 });
        setLocalOnlyMode(data.data.summary?.localOnlyMode || false);
        setDailyLimit(String(data.data.config?.maxDailyCost || 5));
      } else {
        setError(data.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleLocalOnly = async (enabled: boolean) => {
    try {
      const response = await fetch('/api/ai/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forceLocalOnly', enabled }),
      });
      const data = await response.json();
      if (data.success) {
        setLocalOnlyMode(enabled);
      }
    } catch (err) {
      console.error('Failed to toggle local-only mode:', err);
    }
  };

  const handleUpdateLimit = async () => {
    try {
      const response = await fetch('/api/ai/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateConfig', config: { maxDailyCost: parseFloat(dailyLimit) } }),
      });
      const data = await response.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to update limit:', err);
    }
  };

  const handleClearCache = async () => {
    try {
      const response = await fetch('/api/ai/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', daysToKeep: 0 }),
      });
      await response.json();
      fetchData();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    }
  };

  const handleResetDaily = async () => {
    try {
      const response = await fetch('/api/ai/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      await response.json();
      fetchData();
    } catch (err) {
      console.error('Failed to reset stats:', err);
    }
  };

  if (loading && !summary) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Usage & Costs</h1>
          <p className="text-muted-foreground">Monitor and optimize your AI spending</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Daily Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${summary?.dailySpend.toFixed(4) || '0.0000'}
            </div>
            <Progress 
              value={summary?.percentUsed || 0} 
              className={`mt-2 ${summary?.isOverLimit ? 'bg-destructive/20' : summary?.isNearLimit ? 'bg-yellow-500/20' : ''}`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              ${summary?.remainingBudget.toFixed(2) || '0.00'} remaining of ${summary?.dailyLimit.toFixed(2) || '5.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dailyStats?.totalRequests || optimizerStats?.requestCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tokens Saved</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {(optimizerStats?.tokensSaved || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ~${optimizerStats?.estimatedSavings.toFixed(4) || '0.0000'} saved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cacheStats?.hitRate.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {cacheStats?.hits || 0} hits / {(cacheStats?.hits || 0) + (cacheStats?.misses || 0)} total
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>Spending by provider and model</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="provider">
              <TabsList className="mb-4">
                <TabsTrigger value="provider">By Provider</TabsTrigger>
                <TabsTrigger value="model">By Model</TabsTrigger>
              </TabsList>
              
              <TabsContent value="provider" className="space-y-4">
                {summary?.byProvider && Object.keys(summary.byProvider).length > 0 ? (
                  Object.entries(summary.byProvider).map(([provider, data]) => (
                    <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {provider === 'ollama' ? (
                          <Cpu className="h-5 w-5 text-green-500" />
                        ) : (
                          <Cloud className="h-5 w-5 text-blue-500" />
                        )}
                        <div>
                          <p className="font-medium capitalize">{provider}</p>
                          <p className="text-sm text-muted-foreground">{data.requests} requests</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${data.cost.toFixed(4)}</p>
                        {provider === 'ollama' && (
                          <Badge variant="secondary" className="text-xs">Free</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">No usage data yet</p>
                )}
              </TabsContent>
              
              <TabsContent value="model" className="space-y-4">
                {summary?.byModel && Object.keys(summary.byModel).length > 0 ? (
                  Object.entries(summary.byModel).map(([model, data]) => (
                    <div key={model} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{model}</p>
                        <p className="text-sm text-muted-foreground">{data.requests} requests</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${data.cost.toFixed(4)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">No usage data yet</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </CardTitle>
            <CardDescription>Configure cost controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="local-only">Local AI Only</Label>
                <p className="text-xs text-muted-foreground">Use only free Ollama</p>
              </div>
              <Switch
                id="local-only"
                checked={localOnlyMode}
                onCheckedChange={handleToggleLocalOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-limit">Daily Limit ($)</Label>
              <div className="flex gap-2">
                <Input
                  id="daily-limit"
                  type="number"
                  step="0.5"
                  min="0"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleUpdateLimit} size="sm">
                  Set
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Button onClick={handleClearCache} variant="outline" className="w-full">
                Clear Cache
              </Button>
              <Button onClick={handleResetDaily} variant="outline" className="w-full">
                Reset Daily Stats
              </Button>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2">
                {summary?.isOverLimit ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">Over daily limit!</span>
                  </>
                ) : summary?.isNearLimit ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-yellow-600">Approaching limit</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Within budget</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Optimization Strategies</CardTitle>
          <CardDescription>Active cost-saving measures</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Prompt Compression</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Removes filler words and compresses prompts to reduce token usage by up to 50%
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Response Caching</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Caches AI responses for 1 hour to avoid duplicate API calls
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Smart Model Routing</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically selects the cheapest model capable of handling each task
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Local-First Priority</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Prefers free Ollama (80%) over paid OpenAI (20%) for cost optimization
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
