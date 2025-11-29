'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowRightLeft,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Zap,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

interface CashflowOptimizerProps {
  entityId: string;
}

interface Optimization {
  id: string;
  optimization_type: string;
  from_entity_id?: string;
  to_entity_id?: string;
  amount?: number;
  expected_impact?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'pending' | 'approved' | 'executed' | 'rejected';
  created_at?: string;
}

export function CashflowOptimizer({ entityId }: CashflowOptimizerProps) {
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchOptimizations = async () => {
    try {
      const response = await fetch(`/api/agents/cashflow-balance?entity_id=${entityId}`);
      if (response.ok) {
        const data = await response.json();
        setOptimizations(data.optimizations || []);
      }
    } catch (error) {
      console.error('Error fetching optimizations:', error);
    }
  };

  useEffect(() => {
    if (entityId) {
      fetchOptimizations();
    }
  }, [entityId]);

  const generateOptimizations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents/cashflow-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: entityId,
          optimization_type: 'multi_entity_transfer'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate optimizations');
      }

      const result = await response.json();
      toast.success('Cashflow optimization analysis completed');

      // Refresh optimizations list
      await fetchOptimizations();
    } catch (error: any) {
      toast.error('Failed to generate optimizations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const executeOptimization = async (optimizationId: string) => {
    try {
      setExecuting(optimizationId);
      const response = await fetch('/api/agents/cashflow-balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optimization_id: optimizationId,
          action: 'execute'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute optimization');
      }

      toast.success('Optimization executed successfully');
      await fetchOptimizations();
    } catch (error: any) {
      toast.error('Failed to execute: ' + error.message);
    } finally {
      setExecuting(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-blue-500'
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-500';
  };

  const formatOptimizationType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const pendingOptimizations = optimizations.filter(o => o.status === 'pending');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-600" />
          <h3 className="text-lg font-semibold">Cashflow Optimizer</h3>
        </div>
        <Button
          onClick={generateOptimizations}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Optimize
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        AI-powered cashflow optimization suggestions
      </p>

      {pendingOptimizations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <h4 className="text-sm font-medium mb-1">All Optimized</h4>
          <p className="text-xs text-muted-foreground mb-4">
            No pending optimizations. Click Optimize to analyze.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-80">
          <div className="space-y-3">
            {pendingOptimizations.map((optimization) => (
              <div
                key={optimization.id}
                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${getPriorityColor(
                        optimization.priority || 'low'
                      )}`}
                    />
                    <span className="text-sm font-medium">
                      {formatOptimizationType(optimization.optimization_type)}
                    </span>
                  </div>
                  {optimization.priority && (
                    <Badge
                      variant={
                        optimization.priority === 'critical' ||
                        optimization.priority === 'high'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {optimization.priority}
                    </Badge>
                  )}
                </div>

                {optimization.expected_impact && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950 rounded">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <p className="text-xs text-blue-900 dark:text-blue-100">
                        {optimization.expected_impact}
                      </p>
                    </div>
                  </div>
                )}

                {optimization.amount && (
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Transfer ₹{optimization.amount.toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-1 text-green-600">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-semibold">
                      Impact: Positive
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => executeOptimization(optimization.id)}
                      disabled={executing === optimization.id}
                      variant="default"
                      size="sm"
                    >
                      {executing === optimization.id ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Execute
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Summary */}
      {pendingOptimizations.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {pendingOptimizations.length} optimization
              {pendingOptimizations.length !== 1 ? 's' : ''} available
            </span>
            <Button variant="ghost" size="sm" onClick={fetchOptimizations}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
