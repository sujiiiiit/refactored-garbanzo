'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Building2
} from 'lucide-react';
import { KPICards } from '@/components/control-tower/kpi-cards';
import { BurnRateChart } from '@/components/control-tower/burn-rate-chart';
import { RunwayGauge } from '@/components/control-tower/runway-gauge';
import { AnomalyFeed } from '@/components/control-tower/anomaly-feed';
import { CashflowOptimizer } from '@/components/control-tower/cashflow-optimizer';

interface ControlTowerContentProps {
  userId: string;
}

export function ControlTowerContent({ userId }: ControlTowerContentProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const fetchControlTowerData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/business/control-tower');

      if (!response.ok) {
        throw new Error('Failed to fetch control tower data');
      }

      const result = await response.json();
      setData(result);

      // Set first entity as default selected
      if (result.entities && result.entities.length > 0 && !selectedEntity) {
        setSelectedEntity(result.entities[0].entity_id);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchControlTowerData();
  }, [userId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading control tower...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <p>Error: {error}</p>
        </div>
        <Button onClick={fetchControlTowerData} className="mt-4" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  if (!data || data.entities.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Business Entities</h3>
        <p className="text-muted-foreground mb-4">
          You don't have access to any business entities yet. Create or join an entity to get started.
        </p>
      </Card>
    );
  }

  const selectedEntityData = data.entities.find(
    (e: any) => e.entity_id === selectedEntity
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Control Tower</h1>
          <p className="text-muted-foreground">
            Multi-entity financial oversight and analytics
          </p>
        </div>
        <Button onClick={fetchControlTowerData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.slice(0, 3).map((alert: any, index: number) => (
            <Card
              key={index}
              className={`p-4 border-l-4 ${
                alert.severity === 'critical'
                  ? 'border-l-red-500 bg-red-50 dark:bg-red-950'
                  : alert.severity === 'warning'
                  ? 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                  : 'border-l-blue-500 bg-blue-50 dark:bg-blue-950'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`h-5 w-5 mt-0.5 ${
                      alert.severity === 'critical'
                        ? 'text-red-600'
                        : alert.severity === 'warning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          alert.severity === 'critical'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {alert.severity.toUpperCase()}
                      </Badge>
                      {alert.entity_name && (
                        <span className="text-sm font-medium">
                          {alert.entity_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{alert.message}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Summary KPI Cards */}
      <KPICards summary={data.summary} />

      {/* Entity Selector Tabs */}
      <Tabs
        value={selectedEntity || ''}
        onValueChange={setSelectedEntity}
        className="w-full"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {data.entities.map((entity: any) => (
            <TabsTrigger key={entity.entity_id} value={entity.entity_id}>
              <div className="flex items-center gap-2">
                <span>{entity.entity_name}</span>
                <Badge
                  variant={
                    entity.health.overall === 'healthy'
                      ? 'default'
                      : entity.health.overall === 'warning'
                      ? 'secondary'
                      : 'destructive'
                  }
                >
                  {entity.health.overall}
                </Badge>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        {data.entities.map((entity: any) => (
          <TabsContent
            key={entity.entity_id}
            value={entity.entity_id}
            className="space-y-6 mt-6"
          >
            {/* Entity Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Cash Balance
                    </p>
                    <h3 className="text-2xl font-bold mt-2">
                      {entity.currency === 'INR' ? '₹' : '$'}
                      {entity.metrics.cash_balance.toLocaleString()}
                    </h3>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Monthly Burn
                    </p>
                    <h3 className="text-2xl font-bold mt-2">
                      {entity.currency === 'INR' ? '₹' : '$'}
                      {entity.metrics.monthly_burn.toLocaleString()}
                    </h3>
                    {entity.metrics.monthly_burn_target > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Target: {entity.currency === 'INR' ? '₹' : '$'}
                        {entity.metrics.monthly_burn_target.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                {entity.metrics.burn_vs_target_pct !== 0 && (
                  <div className="flex items-center gap-1 mt-3">
                    {entity.metrics.burn_vs_target_pct > 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        entity.metrics.burn_vs_target_pct > 0
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}
                    >
                      {Math.abs(entity.metrics.burn_vs_target_pct)}% vs target
                    </span>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Runway
                    </p>
                    <h3 className="text-2xl font-bold mt-2">
                      {entity.metrics.runway_months} mo
                    </h3>
                    {entity.metrics.target_runway_months > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Target: {entity.metrics.target_runway_months} mo
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div className="mt-3">
                  <Badge
                    variant={
                      entity.health.runway === 'healthy'
                        ? 'default'
                        : entity.health.runway === 'warning'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {entity.health.runway}
                  </Badge>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Transactions (30d)
                    </p>
                    <h3 className="text-2xl font-bold mt-2">
                      {entity.metrics.transaction_count_30d}
                    </h3>
                    {entity.top_category && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Top: {entity.top_category.name} ({entity.top_category.percentage}%)
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <BurnRateChart entityId={entity.entity_id} entityName={entity.entity_name} />
              <RunwayGauge
                currentRunway={entity.metrics.runway_months}
                targetRunway={entity.metrics.target_runway_months}
                cashBalance={entity.metrics.cash_balance}
                monthlyBurn={entity.metrics.monthly_burn}
                currency={entity.currency}
              />
            </div>

            {/* Bottom Section: Anomalies and Cashflow */}
            <div className="grid gap-4 lg:grid-cols-3">
              <AnomalyFeed
                anomalies={entity.anomalies}
                entityId={entity.entity_id}
                entityName={entity.entity_name}
              />
              <CashflowOptimizer entityId={entity.entity_id} />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Cross-Entity Insights */}
      {data.cross_entity_insights && data.cross_entity_insights.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Cross-Entity Insights</h3>
          <ul className="space-y-2">
            {data.cross_entity_insights.map((insight: string, index: number) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <span className="text-sm">{insight}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
