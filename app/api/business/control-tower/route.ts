/**
 * GET /api/business/control-tower - Multi-entity dashboard overview
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all entities user has access to
    const { data: memberships, error: memberError } = await supabase
      .from('entity_members')
      .select(`
        role,
        entities (
          id,
          name,
          type,
          currency,
          monthly_burn_target,
          runway_months,
          cash_balance,
          created_at,
          is_active
        )
      `)
      .eq('user_id', user.id);

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to fetch entities', details: memberError.message },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({
        entities: [],
        summary: {
          total_entities: 0,
          total_cash: 0,
          total_monthly_burn: 0,
          avg_runway: 0
        },
        alerts: [],
        insights: []
      });
    }

    // Get metrics for each entity
    const entityMetrics = await Promise.all(
      memberships.map(async (m) => {
        const entity = m.entities;
        if (!entity) return null;

        // Get last 30 days transactions
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount, transaction_date, category')
          .eq('entity_id', entity.id)
          .gte('transaction_date', thirtyDaysAgo.toISOString().split('T')[0])
          .is('deleted_at', null);

        const totalBurn = transactions?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
        const monthlyBurn = totalBurn; // Already 30 days
        const cashBalance = Number(entity.cash_balance || 0);
        const runway = monthlyBurn > 0 ? cashBalance / monthlyBurn : 999;

        // Get recent anomalies
        const { data: anomalies } = await supabase
          .from('anomalies')
          .select('id, anomaly_type, severity, potential_savings')
          .eq('entity_id', entity.id)
          .eq('status', 'active')
          .order('detected_at', { ascending: false })
          .limit(5);

        // Get pending insights
        const { data: insights } = await supabase
          .from('insights')
          .select('id, insight_type, confidence')
          .eq('entity_id', entity.id)
          .eq('status', 'pending')
          .order('generated_at', { ascending: false })
          .limit(3);

        // Category breakdown
        const categorySpend: Record<string, number> = {};
        transactions?.forEach(tx => {
          const cat = tx.category || 'Uncategorized';
          categorySpend[cat] = (categorySpend[cat] || 0) + Number(tx.amount);
        });

        const topCategory = Object.entries(categorySpend)
          .sort(([, a], [, b]) => b - a)[0];

        // Health status
        const targetBurn = Number(entity.monthly_burn_target || 0);
        const burnHealth = targetBurn > 0 && monthlyBurn > targetBurn * 1.2 ? 'over_budget' :
                           targetBurn > 0 && monthlyBurn > targetBurn ? 'warning' : 'healthy';

        const runwayHealth = runway < 3 ? 'critical' :
                             runway < 6 ? 'warning' : 'healthy';

        const overallHealth = burnHealth === 'over_budget' || runwayHealth === 'critical' ? 'critical' :
                               burnHealth === 'warning' || runwayHealth === 'warning' ? 'warning' : 'healthy';

        return {
          entity_id: entity.id,
          entity_name: entity.name,
          entity_type: entity.type,
          currency: entity.currency || 'INR',
          user_role: m.role,
          metrics: {
            cash_balance: cashBalance,
            monthly_burn: Math.round(monthlyBurn * 100) / 100,
            monthly_burn_target: Number(entity.monthly_burn_target || 0),
            burn_vs_target_pct: targetBurn > 0 ? Math.round(((monthlyBurn - targetBurn) / targetBurn) * 100) : 0,
            runway_months: Math.round(runway * 10) / 10,
            target_runway_months: Number(entity.runway_months || 0),
            transaction_count_30d: transactions?.length || 0
          },
          health: {
            overall: overallHealth,
            burn: burnHealth,
            runway: runwayHealth
          },
          top_category: topCategory ? {
            name: topCategory[0],
            amount: Math.round(topCategory[1] * 100) / 100,
            percentage: Math.round((topCategory[1] / totalBurn) * 100)
          } : null,
          anomalies: anomalies || [],
          insights: insights || [],
          last_updated: new Date().toISOString()
        };
      })
    );

    const validMetrics = entityMetrics.filter(m => m !== null);

    // Calculate aggregate summary
    const totalCash = validMetrics.reduce((sum, m) => sum + m.metrics.cash_balance, 0);
    const totalMonthlyBurn = validMetrics.reduce((sum, m) => sum + m.metrics.monthly_burn, 0);
    const avgRunway = validMetrics.length > 0
      ? validMetrics.reduce((sum, m) => sum + m.metrics.runway_months, 0) / validMetrics.length
      : 0;

    // Generate cross-entity alerts
    const alerts: Array<{
      severity: 'critical' | 'warning' | 'info';
      entity_id: string | null;
      entity_name: string | null;
      message: string;
      action_required: boolean;
    }> = [];

    validMetrics.forEach(m => {
      if (m.health.runway === 'critical') {
        alerts.push({
          severity: 'critical',
          entity_id: m.entity_id,
          entity_name: m.entity_name,
          message: `${m.entity_name} has only ${m.metrics.runway_months} months of runway remaining`,
          action_required: true
        });
      }

      if (m.health.burn === 'over_budget') {
        alerts.push({
          severity: 'warning',
          entity_id: m.entity_id,
          entity_name: m.entity_name,
          message: `${m.entity_name} is ${m.metrics.burn_vs_target_pct}% over monthly burn target`,
          action_required: true
        });
      }

      // High severity anomalies
      const criticalAnomalies = m.anomalies.filter(a => a.severity === 'critical' || a.severity === 'high');
      if (criticalAnomalies.length > 0) {
        alerts.push({
          severity: 'warning',
          entity_id: m.entity_id,
          entity_name: m.entity_name,
          message: `${criticalAnomalies.length} high-priority anomalies detected in ${m.entity_name}`,
          action_required: true
        });
      }
    });

    // Sort alerts by severity
    alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Generate cross-entity insights
    const crossEntityInsights: string[] = [];

    if (validMetrics.length > 1) {
      // Compare burn rates
      const avgBurn = totalMonthlyBurn / validMetrics.length;
      const highBurnEntities = validMetrics.filter(m => m.metrics.monthly_burn > avgBurn * 1.5);

      if (highBurnEntities.length > 0) {
        crossEntityInsights.push(
          `${highBurnEntities.map(e => e.entity_name).join(', ')} ${highBurnEntities.length > 1 ? 'have' : 'has'} significantly higher burn rates than average`
        );
      }

      // Identify cashflow optimization opportunities
      const cashRich = validMetrics.filter(m => m.metrics.runway_months > 12);
      const cashPoor = validMetrics.filter(m => m.metrics.runway_months < 6);

      if (cashRich.length > 0 && cashPoor.length > 0) {
        crossEntityInsights.push(
          `Consider cashflow optimization: transfer funds from ${cashRich[0].entity_name} to ${cashPoor[0].entity_name}`
        );
      }
    }

    return NextResponse.json({
      entities: validMetrics,
      summary: {
        total_entities: validMetrics.length,
        active_entities: validMetrics.filter(m => m.health.overall !== 'critical').length,
        entities_needing_attention: validMetrics.filter(m => m.health.overall === 'critical' || m.health.overall === 'warning').length,
        total_cash: Math.round(totalCash * 100) / 100,
        total_monthly_burn: Math.round(totalMonthlyBurn * 100) / 100,
        avg_runway_months: Math.round(avgRunway * 10) / 10,
        total_anomalies: validMetrics.reduce((sum, m) => sum + m.anomalies.length, 0),
        total_insights: validMetrics.reduce((sum, m) => sum + m.insights.length, 0)
      },
      alerts,
      cross_entity_insights: crossEntityInsights,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching control tower data:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
