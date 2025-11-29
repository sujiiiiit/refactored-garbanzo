/**
 * GET /api/business/burn-rate - Analyze burn rate for business entities
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

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const entity_id = searchParams.get('entity_id');
    const period = searchParams.get('period') || '30'; // days
    const granularity = searchParams.get('granularity') || 'daily'; // daily, weekly, monthly

    if (!entity_id) {
      return NextResponse.json(
        { error: 'entity_id is required' },
        { status: 400 }
      );
    }

    // Verify user has access to entity
    const { data: membership, error: memberError } = await supabase
      .from('entity_members')
      .select('role, entities(id, name, monthly_burn_target, runway_months, currency)')
      .eq('entity_id', entity_id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 404 }
      );
    }

    const entity = membership.entities;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get burn rate history from TimescaleDB
    const { data: burnHistory, error: burnError } = await supabase
      .from('burn_rate_history')
      .select('*')
      .eq('entity_id', entity_id)
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: true });

    if (burnError) {
      console.error('Burn history error:', burnError);
    }

    // Get transactions for the period
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('amount, transaction_date, category, merchant_name')
      .eq('entity_id', entity_id)
      .gte('transaction_date', startDate.toISOString().split('T')[0])
      .lte('transaction_date', endDate.toISOString().split('T')[0])
      .is('deleted_at', null)
      .order('transaction_date', { ascending: true });

    if (txError) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: txError.message },
        { status: 500 }
      );
    }

    // Calculate daily burn
    const dailyBurn: Record<string, number> = {};
    transactions?.forEach(tx => {
      const date = tx.transaction_date;
      dailyBurn[date] = (dailyBurn[date] || 0) + Number(tx.amount);
    });

    // Aggregate by granularity
    const aggregated: Array<{ period: string; burn: number; transaction_count: number }> = [];

    if (granularity === 'daily') {
      Object.entries(dailyBurn).forEach(([date, burn]) => {
        aggregated.push({
          period: date,
          burn: Math.round(burn * 100) / 100,
          transaction_count: transactions?.filter(tx => tx.transaction_date === date).length || 0
        });
      });
    } else if (granularity === 'weekly') {
      const weeklyData: Record<string, { burn: number; count: number }> = {};

      transactions?.forEach(tx => {
        const date = new Date(tx.transaction_date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { burn: 0, count: 0 };
        }
        weeklyData[weekKey].burn += Number(tx.amount);
        weeklyData[weekKey].count += 1;
      });

      Object.entries(weeklyData).forEach(([week, data]) => {
        aggregated.push({
          period: week,
          burn: Math.round(data.burn * 100) / 100,
          transaction_count: data.count
        });
      });
    } else if (granularity === 'monthly') {
      const monthlyData: Record<string, { burn: number; count: number }> = {};

      transactions?.forEach(tx => {
        const date = new Date(tx.transaction_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { burn: 0, count: 0 };
        }
        monthlyData[monthKey].burn += Number(tx.amount);
        monthlyData[monthKey].count += 1;
      });

      Object.entries(monthlyData).forEach(([month, data]) => {
        aggregated.push({
          period: month,
          burn: Math.round(data.burn * 100) / 100,
          transaction_count: data.count
        });
      });
    }

    // Calculate statistics
    const totalBurn = transactions?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
    const avgDailyBurn = totalBurn / parseInt(period);
    const avgMonthlyBurn = avgDailyBurn * 30;

    // Calculate category breakdown
    const categoryBurn: Record<string, number> = {};
    transactions?.forEach(tx => {
      const cat = tx.category || 'Uncategorized';
      categoryBurn[cat] = (categoryBurn[cat] || 0) + Number(tx.amount);
    });

    const topCategories = Object.entries(categoryBurn)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: Math.round((amount / totalBurn) * 10000) / 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Calculate runway
    const { data: entityData } = await supabase
      .from('entities')
      .select('cash_balance')
      .eq('id', entity_id)
      .single();

    const cashBalance = Number(entityData?.cash_balance || 0);
    const currentRunway = avgMonthlyBurn > 0 ? cashBalance / avgMonthlyBurn : 999;

    // Trend analysis
    const recentBurn = aggregated.slice(-7).reduce((sum, d) => sum + d.burn, 0) / 7;
    const olderBurn = aggregated.slice(0, 7).reduce((sum, d) => sum + d.burn, 0) / 7;
    const trend = olderBurn > 0 ? ((recentBurn - olderBurn) / olderBurn) * 100 : 0;

    // Health assessment
    const targetBurn = Number(entity?.monthly_burn_target || 0);
    const burnHealth = targetBurn > 0
      ? avgMonthlyBurn <= targetBurn
        ? 'healthy'
        : avgMonthlyBurn <= targetBurn * 1.2
        ? 'warning'
        : 'critical'
      : 'unknown';

    return NextResponse.json({
      entity: {
        id: entity?.id,
        name: entity?.name,
        currency: entity?.currency || 'INR',
        monthly_burn_target: Number(entity?.monthly_burn_target || 0),
        target_runway_months: Number(entity?.runway_months || 0)
      },
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        days: parseInt(period),
        granularity
      },
      burn_summary: {
        total_burn: Math.round(totalBurn * 100) / 100,
        avg_daily_burn: Math.round(avgDailyBurn * 100) / 100,
        avg_monthly_burn: Math.round(avgMonthlyBurn * 100) / 100,
        transaction_count: transactions?.length || 0
      },
      runway: {
        current_cash: cashBalance,
        months_remaining: Math.round(currentRunway * 10) / 10,
        target_months: Number(entity?.runway_months || 0),
        status: currentRunway < 3 ? 'critical' :
                currentRunway < 6 ? 'warning' : 'healthy'
      },
      trend: {
        direction: trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable',
        percentage_change: Math.round(trend * 10) / 10,
        health: burnHealth
      },
      top_categories: topCategories,
      time_series: aggregated,
      recommendations: generateBurnRecommendations(
        avgMonthlyBurn,
        Number(entity?.monthly_burn_target || 0),
        currentRunway,
        trend,
        topCategories
      )
    });

  } catch (error: any) {
    console.error('Error analyzing burn rate:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

function generateBurnRecommendations(
  actualBurn: number,
  targetBurn: number,
  runway: number,
  trend: number,
  topCategories: Array<{ category: string; amount: number; percentage: number }>
): string[] {
  const recommendations: string[] = [];

  if (actualBurn > targetBurn * 1.2) {
    recommendations.push(`🚨 Monthly burn (₹${Math.round(actualBurn).toLocaleString()}) exceeds target by ${Math.round(((actualBurn - targetBurn) / targetBurn) * 100)}%. Immediate action required.`);
  }

  if (runway < 3) {
    recommendations.push(`⚠️ Critical: Only ${Math.round(runway * 10) / 10} months of runway remaining. Secure funding or reduce burn immediately.`);
  } else if (runway < 6) {
    recommendations.push(`⚠️ Warning: ${Math.round(runway * 10) / 10} months runway. Consider fundraising or cost optimization.`);
  }

  if (trend > 15) {
    recommendations.push(`📈 Burn rate increasing ${Math.round(trend)}%. Review recent hiring, marketing, or infrastructure costs.`);
  }

  // Category-specific recommendations
  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    if (topCategory.percentage > 40) {
      recommendations.push(`💡 ${topCategory.category} accounts for ${topCategory.percentage}% of burn. Consider negotiating better rates or finding alternatives.`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Burn rate is within healthy targets. Continue monitoring monthly.');
  }

  return recommendations;
}
