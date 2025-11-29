'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, TrendingDown, Wallet } from 'lucide-react';

interface RunwayGaugeProps {
  currentRunway: number;
  targetRunway: number;
  cashBalance: number;
  monthlyBurn: number;
  currency: string;
}

export function RunwayGauge({
  currentRunway,
  targetRunway,
  cashBalance,
  monthlyBurn,
  currency
}: RunwayGaugeProps) {
  // Calculate percentage for progress bar (cap at 100%)
  const progressPercentage = targetRunway > 0
    ? Math.min((currentRunway / targetRunway) * 100, 100)
    : currentRunway >= 12 ? 100 : (currentRunway / 12) * 100;

  // Determine health status
  const getHealthStatus = () => {
    if (currentRunway < 3) return { status: 'Critical', color: 'destructive', bgColor: 'bg-red-100 dark:bg-red-950' };
    if (currentRunway < 6) return { status: 'Warning', color: 'secondary', bgColor: 'bg-yellow-100 dark:bg-yellow-950' };
    return { status: 'Healthy', color: 'default', bgColor: 'bg-green-100 dark:bg-green-950' };
  };

  const health = getHealthStatus();

  // Calculate estimated depletion date
  const getDepletionDate = () => {
    if (monthlyBurn === 0) return 'Never (no burn)';
    const months = Math.floor(currentRunway);
    const days = Math.floor((currentRunway - months) * 30);
    const depletionDate = new Date();
    depletionDate.setMonth(depletionDate.getMonth() + months);
    depletionDate.setDate(depletionDate.getDate() + days);
    return depletionDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Milestone markers (3, 6, 12 months)
  const milestones = [
    { months: 3, label: '3mo', position: targetRunway > 0 ? (3 / targetRunway) * 100 : 25 },
    { months: 6, label: '6mo', position: targetRunway > 0 ? (6 / targetRunway) * 100 : 50 },
    { months: 12, label: '12mo', position: targetRunway > 0 ? (12 / targetRunway) * 100 : 100 }
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Runway Analysis</h3>
          <p className="text-sm text-muted-foreground">Cash runway projection</p>
        </div>
        <Badge variant={health.color as any}>{health.status}</Badge>
      </div>

      {/* Circular Gauge Visualization */}
      <div className="flex flex-col items-center justify-center py-6">
        {/* Main Runway Display */}
        <div className={`relative w-48 h-48 rounded-full ${health.bgColor} flex items-center justify-center`}>
          <div className="absolute inset-4 bg-background rounded-full flex flex-col items-center justify-center">
            <Calendar className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="text-center">
              <p className="text-4xl font-bold">{currentRunway.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">months</p>
            </div>
          </div>
          {/* Progress ring (using conic gradient) */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted opacity-20"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${(progressPercentage / 100) * 283} 283`}
              className={
                currentRunway < 3
                  ? 'text-red-500'
                  : currentRunway < 6
                  ? 'text-yellow-500'
                  : 'text-green-500'
              }
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Target vs Current */}
        {targetRunway > 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Target: {targetRunway} months
              {currentRunway < targetRunway && (
                <span className="text-red-500 ml-2">
                  (-{(targetRunway - currentRunway).toFixed(1)} mo)
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Progress Bar with Milestones */}
      <div className="mb-6">
        <div className="relative">
          <Progress value={progressPercentage} className="h-3" />
          {/* Milestone markers */}
          <div className="relative mt-2 h-6">
            {milestones.map((milestone, index) => (
              <div
                key={index}
                className="absolute flex flex-col items-center"
                style={{ left: `${Math.min(milestone.position, 100)}%`, transform: 'translateX(-50%)' }}
              >
                <div className={`w-px h-2 ${currentRunway >= milestone.months ? 'bg-primary' : 'bg-muted'}`} />
                <span className={`text-xs ${currentRunway >= milestone.months ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {milestone.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial Details */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cash Balance</span>
          </div>
          <span className="text-sm font-semibold">
            {currency === 'INR' ? '₹' : '$'}{cashBalance.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Monthly Burn</span>
          </div>
          <span className="text-sm font-semibold">
            {currency === 'INR' ? '₹' : '$'}{monthlyBurn.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Est. Depletion</span>
          </div>
          <span className="text-sm font-semibold">{getDepletionDate()}</span>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-4 p-3 bg-muted rounded-lg">
        <p className="text-xs font-medium mb-1">Recommendation</p>
        <p className="text-xs text-muted-foreground">
          {currentRunway < 3
            ? '🚨 Critical: Secure funding immediately or drastically reduce burn rate.'
            : currentRunway < 6
            ? '⚠️ Start fundraising conversations now. Aim for 12+ months runway.'
            : currentRunway < 12
            ? '✅ Healthy runway. Monitor monthly and plan for growth.'
            : '🎉 Excellent runway! Consider strategic investments or expansion.'}
        </p>
      </div>
    </Card>
  );
}
