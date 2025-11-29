'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, DollarSign, Calendar, AlertTriangle } from 'lucide-react';

interface KPICardsProps {
  summary: {
    total_entities: number;
    active_entities: number;
    entities_needing_attention: number;
    total_cash: number;
    total_monthly_burn: number;
    avg_runway_months: number;
    total_anomalies: number;
    total_insights: number;
  };
}

export function KPICards({ summary }: KPICardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Entities */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Business Entities
            </p>
            <h3 className="text-2xl font-bold mt-2">{summary.total_entities}</h3>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="default">{summary.active_entities} active</Badge>
              {summary.entities_needing_attention > 0 && (
                <Badge variant="destructive">
                  {summary.entities_needing_attention} need attention
                </Badge>
              )}
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </Card>

      {/* Total Cash */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total Cash Balance
            </p>
            <h3 className="text-2xl font-bold mt-2">
              ₹{summary.total_cash.toLocaleString()}
            </h3>
            <p className="text-xs text-muted-foreground mt-2">
              Across all entities
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </Card>

      {/* Monthly Burn */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total Monthly Burn
            </p>
            <h3 className="text-2xl font-bold mt-2">
              ₹{summary.total_monthly_burn.toLocaleString()}
            </h3>
            <p className="text-xs text-muted-foreground mt-2">
              Combined burn rate
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-orange-600" />
          </div>
        </div>
      </Card>

      {/* Average Runway */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Avg Runway
            </p>
            <h3 className="text-2xl font-bold mt-2">
              {summary.avg_runway_months.toFixed(1)} mo
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant={
                  summary.avg_runway_months >= 6
                    ? 'default'
                    : summary.avg_runway_months >= 3
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {summary.avg_runway_months >= 6
                  ? 'Healthy'
                  : summary.avg_runway_months >= 3
                  ? 'Warning'
                  : 'Critical'}
              </Badge>
              {summary.total_anomalies > 0 && (
                <div className="flex items-center gap-1 text-xs text-yellow-600">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.total_anomalies}
                </div>
              )}
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-purple-600" />
          </div>
        </div>
      </Card>
    </div>
  );
}
