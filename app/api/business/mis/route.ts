/**
 * GET /api/business/mis - Generate MIS (Management Information System) reports
 * POST /api/business/mis - Create and schedule MIS report generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface MISReportData {
  entity_id: string;
  entity_name: string;
  report_period: {
    start_date: string;
    end_date: string;
    month: string;
  };
  financial_summary: {
    total_expenses: number;
    category_breakdown: Array<{
      category: string;
      amount: number;
      percentage: number;
      transaction_count: number;
    }>;
    top_merchants: Array<{
      merchant: string;
      amount: number;
      transaction_count: number;
    }>;
    payment_method_breakdown: Record<string, number>;
  };
  burn_analysis: {
    monthly_burn: number;
    target_burn: number;
    variance: number;
    variance_percentage: number;
    daily_average: number;
    week_over_week_change: number;
  };
  runway_analysis: {
    current_cash: number;
    months_remaining: number;
    target_runway: number;
    projected_zero_date: string | null;
    status: 'healthy' | 'warning' | 'critical';
  };
  gst_summary: {
    total_gst_paid: number;
    gst_breakdown: Record<string, number>;
    itc_eligible: number;
  };
  anomalies_detected: Array<{
    type: string;
    severity: string;
    description: string;
    potential_savings: number;
  }>;
  insights: Array<{
    type: string;
    message: string;
    confidence: number;
  }>;
}

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
    const month = searchParams.get('month'); // YYYY-MM format
    const format = searchParams.get('format') || 'json'; // json, pdf, excel

    if (!entity_id) {
      return NextResponse.json(
        { error: 'entity_id is required' },
        { status: 400 }
      );
    }

    // Verify user has access to entity
    const { data: membership, error: memberError } = await supabase
      .from('entity_members')
      .select('role, entities(id, name, type, currency, monthly_burn_target, runway_months, cash_balance)')
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

    // Determine report period
    let startDate: Date, endDate: Date;
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      startDate = new Date(year, monthNum - 1, 1);
      endDate = new Date(year, monthNum, 0); // Last day of month
    } else {
      // Default to last month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get all transactions for the period
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('entity_id', entity_id)
      .gte('transaction_date', startDateStr)
      .lte('transaction_date', endDateStr)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: true });

    if (txError) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: txError.message },
        { status: 500 }
      );
    }

    // Calculate financial summary
    const totalExpenses = transactions?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

    // Category breakdown
    const categoryData: Record<string, { amount: number; count: number }> = {};
    transactions?.forEach(tx => {
      const cat = tx.category || 'Uncategorized';
      if (!categoryData[cat]) {
        categoryData[cat] = { amount: 0, count: 0 };
      }
      categoryData[cat].amount += Number(tx.amount);
      categoryData[cat].count += 1;
    });

    const categoryBreakdown = Object.entries(categoryData)
      .map(([category, data]) => ({
        category,
        amount: Math.round(data.amount * 100) / 100,
        percentage: Math.round((data.amount / totalExpenses) * 10000) / 100,
        transaction_count: data.count
      }))
      .sort((a, b) => b.amount - a.amount);

    // Top merchants
    const merchantData: Record<string, { amount: number; count: number }> = {};
    transactions?.forEach(tx => {
      const merchant = tx.merchant_name || 'Unknown';
      if (!merchantData[merchant]) {
        merchantData[merchant] = { amount: 0, count: 0 };
      }
      merchantData[merchant].amount += Number(tx.amount);
      merchantData[merchant].count += 1;
    });

    const topMerchants = Object.entries(merchantData)
      .map(([merchant, data]) => ({
        merchant,
        amount: Math.round(data.amount * 100) / 100,
        transaction_count: data.count
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Payment method breakdown
    const paymentMethods: Record<string, number> = {};
    transactions?.forEach(tx => {
      const method = (tx.metadata as any)?.payment_method || 'Unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + Number(tx.amount);
    });

    // Burn analysis
    const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyAverage = totalExpenses / daysInPeriod;
    const monthlyBurn = (totalExpenses / daysInPeriod) * 30;
    const targetBurn = Number(entity?.monthly_burn_target || 0);
    const variance = monthlyBurn - targetBurn;
    const variancePercentage = targetBurn > 0 ? (variance / targetBurn) * 100 : 0;

    // Week-over-week analysis
    const midpoint = new Date((startDate.getTime() + endDate.getTime()) / 2);
    const firstHalf = transactions?.filter(tx => new Date(tx.transaction_date) < midpoint);
    const secondHalf = transactions?.filter(tx => new Date(tx.transaction_date) >= midpoint);

    const firstHalfBurn = firstHalf?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
    const secondHalfBurn = secondHalf?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
    const weekOverWeekChange = firstHalfBurn > 0 ? ((secondHalfBurn - firstHalfBurn) / firstHalfBurn) * 100 : 0;

    // Runway analysis
    const cashBalance = Number(entity?.cash_balance || 0);
    const runwayMonths = monthlyBurn > 0 ? cashBalance / monthlyBurn : 999;
    const projectedZeroDate = monthlyBurn > 0
      ? new Date(Date.now() + (runwayMonths * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
      : null;

    const runwayStatus = runwayMonths < 3 ? 'critical' as const :
                         runwayMonths < 6 ? 'warning' as const : 'healthy' as const;

    // GST summary
    const gstData: Record<string, number> = { '0%': 0, '5%': 0, '12%': 0, '18%': 0, '28%': 0 };
    let totalGST = 0;

    transactions?.forEach(tx => {
      const gstRate = tx.gst_rate || 0;
      const gstAmount = (Number(tx.amount) * gstRate) / (100 + gstRate);
      totalGST += gstAmount;

      const key = `${gstRate}%`;
      if (gstData[key] !== undefined) {
        gstData[key] += gstAmount;
      }
    });

    const itcEligible = totalGST * 0.9; // Assume 90% ITC eligibility

    // Get anomalies for the period
    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('anomaly_type, severity, description, potential_savings')
      .eq('entity_id', entity_id)
      .gte('detected_at', startDateStr)
      .lte('detected_at', endDateStr)
      .order('severity', { ascending: false })
      .limit(10);

    // Get insights for the period
    const { data: insights } = await supabase
      .from('insights')
      .select('insight_type, message, confidence')
      .eq('entity_id', entity_id)
      .gte('generated_at', startDateStr)
      .lte('generated_at', endDateStr)
      .order('confidence', { ascending: false })
      .limit(10);

    // Build report data
    const reportData: MISReportData = {
      entity_id: entity?.id || '',
      entity_name: entity?.name || '',
      report_period: {
        start_date: startDateStr,
        end_date: endDateStr,
        month: `${startDate.toLocaleString('default', { month: 'long' })} ${startDate.getFullYear()}`
      },
      financial_summary: {
        total_expenses: Math.round(totalExpenses * 100) / 100,
        category_breakdown: categoryBreakdown,
        top_merchants: topMerchants,
        payment_method_breakdown: paymentMethods
      },
      burn_analysis: {
        monthly_burn: Math.round(monthlyBurn * 100) / 100,
        target_burn: targetBurn,
        variance: Math.round(variance * 100) / 100,
        variance_percentage: Math.round(variancePercentage * 10) / 10,
        daily_average: Math.round(dailyAverage * 100) / 100,
        week_over_week_change: Math.round(weekOverWeekChange * 10) / 10
      },
      runway_analysis: {
        current_cash: cashBalance,
        months_remaining: Math.round(runwayMonths * 10) / 10,
        target_runway: Number(entity?.runway_months || 0),
        projected_zero_date: projectedZeroDate,
        status: runwayStatus
      },
      gst_summary: {
        total_gst_paid: Math.round(totalGST * 100) / 100,
        gst_breakdown: gstData,
        itc_eligible: Math.round(itcEligible * 100) / 100
      },
      anomalies_detected: anomalies?.map(a => ({
        type: a.anomaly_type,
        severity: a.severity,
        description: a.description,
        potential_savings: Number(a.potential_savings || 0)
      })) || [],
      insights: insights?.map(i => ({
        type: i.insight_type,
        message: i.message,
        confidence: i.confidence
      })) || []
    };

    // Store report in database
    const { data: savedReport } = await supabase
      .from('mis_reports')
      .insert({
        entity_id: entity_id,
        period_start: startDateStr,
        period_end: endDateStr,
        report_data: reportData,
        generated_by: user.id
      })
      .select()
      .single();

    if (format === 'json') {
      return NextResponse.json(reportData);
    } else if (format === 'pdf') {
      // TODO: Generate PDF using library like @react-pdf/renderer
      return NextResponse.json(
        { error: 'PDF generation not yet implemented', report_id: savedReport?.id },
        { status: 501 }
      );
    } else if (format === 'excel') {
      // TODO: Generate Excel using library like exceljs
      return NextResponse.json(
        { error: 'Excel generation not yet implemented', report_id: savedReport?.id },
        { status: 501 }
      );
    }

    return NextResponse.json(reportData);

  } catch (error: any) {
    console.error('Error generating MIS report:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { entity_id, schedule, recipients } = body;

    // Verify user is admin
    const { data: membership } = await supabase
      .from('entity_members')
      .select('role')
      .eq('entity_id', entity_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can schedule reports' },
        { status: 403 }
      );
    }

    // TODO: Schedule report generation using cron job or BullMQ
    // For now, just acknowledge the request

    return NextResponse.json({
      message: 'Report scheduling not yet implemented',
      entity_id,
      schedule,
      recipients
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error scheduling MIS report:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
