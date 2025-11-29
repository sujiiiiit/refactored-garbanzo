'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BurnRateChartProps {
  entityId: string;
  entityName: string;
}

export function BurnRateChart({ entityId, entityName }: BurnRateChartProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [granularity, setGranularity] = useState('daily');

  const fetchBurnRateData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/business/burn-rate?entity_id=${entityId}&period=${period}&granularity=${granularity}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch burn rate data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching burn rate:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      fetchBurnRateData();
    }
  }, [entityId, period, granularity]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (granularity === 'daily') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (granularity === 'weekly') {
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  const getTrendIcon = () => {
    if (!data?.trend) return null;

    switch (data.trend.direction) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = () => {
    if (!data?.trend) return 'text-gray-500';
    switch (data.trend.direction) {
      case 'increasing':
        return 'text-red-500';
      case 'decreasing':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Burn Rate Trend</h3>
          <p className="text-sm text-muted-foreground">{entityName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="180">6 months</SelectItem>
            </SelectContent>
          </Select>
          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchBurnRateData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="h-64 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground">Avg Daily</p>
              <p className="text-lg font-semibold">
                ₹{data.burn_summary?.avg_daily_burn.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Monthly</p>
              <p className="text-lg font-semibold">
                ₹{data.burn_summary?.avg_monthly_burn.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trend</p>
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span className={`text-sm font-medium ${getTrendColor()}`}>
                  {data.trend?.direction} {Math.abs(data.trend?.percentage_change || 0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.time_series || []}>
              <defs>
                <linearGradient id="burnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="period"
                tickFormatter={formatDate}
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `₹${value.toLocaleString()}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="text-sm font-medium mb-1">
                          {formatDate(payload[0].payload.period)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Burn: ₹{payload[0].value?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payload[0].payload.transaction_count} transactions
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="burn"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#burnGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Health Badge */}
          {data.trend && (
            <div className="mt-4">
              <Badge
                variant={
                  data.trend.health === 'healthy'
                    ? 'default'
                    : data.trend.health === 'warning'
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {data.trend.health}
              </Badge>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Recommendations</p>
              <ul className="space-y-1">
                {data.recommendations.slice(0, 2).map((rec: string, index: number) => (
                  <li key={index} className="text-xs text-muted-foreground">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          <p>No data available</p>
        </div>
      )}
    </Card>
  );
}
