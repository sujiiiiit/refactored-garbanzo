'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Ghost,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

interface Anomaly {
  id: string;
  anomaly_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  potential_savings?: number;
  description?: string;
  detected_at?: string;
}

interface AnomalyFeedProps {
  anomalies: Anomaly[];
  entityId: string;
  entityName: string;
}

export function AnomalyFeed({ anomalies, entityId, entityName }: AnomalyFeedProps) {
  const [loading, setLoading] = useState(false);
  const [localAnomalies, setLocalAnomalies] = useState(anomalies);

  const triggerScan = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents/ghost-hunter/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId })
      });

      if (!response.ok) {
        throw new Error('Scan failed');
      }

      const result = await response.json();
      toast.success(`Ghost Hunter scan completed. Found ${result.anomalies?.length || 0} anomalies.`);

      // Refresh the anomalies list
      const listResponse = await fetch(`/api/agents/ghost-hunter/scan?entity_id=${entityId}`);
      if (listResponse.ok) {
        const listData = await listResponse.json();
        setLocalAnomalies(listData.anomalies || []);
      }
    } catch (error: any) {
      toast.error('Failed to run scan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getAnomalyIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      duplicate_subscription: <RefreshCw className="h-4 w-4" />,
      forgotten_vendor: <Ghost className="h-4 w-4" />,
      duplicate_transaction: <AlertTriangle className="h-4 w-4" />,
      category_mismatch: <Eye className="h-4 w-4" />,
      unusual_pattern: <TrendingUp className="h-4 w-4" />
    };
    return icons[type] || <AlertTriangle className="h-4 w-4" />;
  };

  const getSeverityColor = (severity: string) => {
    const colors = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-blue-500'
    };
    return colors[severity as keyof typeof colors] || 'bg-gray-500';
  };

  const formatAnomalyType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Ghost className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Ghost Hunter Alerts</h3>
        </div>
        <Button
          onClick={triggerScan}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Scan Now
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        AI-detected anomalies and wasteful spending in {entityName}
      </p>

      {localAnomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <h4 className="text-sm font-medium mb-1">No Anomalies Detected</h4>
          <p className="text-xs text-muted-foreground">
            All expenses look normal. Run a scan to check again.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-80">
          <div className="space-y-3">
            {localAnomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${getSeverityColor(
                        anomaly.severity
                      )}`}
                    />
                    <span className="text-sm font-medium">
                      {formatAnomalyType(anomaly.anomaly_type)}
                    </span>
                  </div>
                  <Badge
                    variant={
                      anomaly.severity === 'critical' || anomaly.severity === 'high'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {anomaly.severity}
                  </Badge>
                </div>

                {anomaly.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {anomaly.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  {anomaly.potential_savings && anomaly.potential_savings > 0 ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        Save ₹{anomaly.potential_savings.toLocaleString()}/mo
                      </span>
                    </div>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <XCircle className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Summary Stats */}
      {localAnomalies.length > 0 && (
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Anomalies</p>
            <p className="text-lg font-semibold">{localAnomalies.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Potential Savings</p>
            <p className="text-lg font-semibold text-green-600">
              ₹
              {localAnomalies
                .reduce((sum, a) => sum + (a.potential_savings || 0), 0)
                .toLocaleString()}
              /mo
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
