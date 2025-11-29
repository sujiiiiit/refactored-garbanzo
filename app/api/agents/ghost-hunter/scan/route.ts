/**
 * POST /api/agents/ghost-hunter/scan - Trigger anomaly detection scan
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ghostHunterAgent } from '@/lib/agents/ghost-hunter-agent';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { entity_id, scan_types, lookback_days } = body;

    // If entity_id provided, verify access
    if (entity_id) {
      const { data: membership } = await supabase
        .from('entity_members')
        .select('role')
        .eq('entity_id', entity_id)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'Entity not found or access denied' },
          { status: 404 }
        );
      }
    }

    // Execute ghost hunter agent
    const result = await ghostHunterAgent.execute(
      {
        user_id: entity_id ? undefined : user.id,
        entity_id,
        lookback_days: lookback_days || 90,
        scan_types: scan_types || [
          'duplicate_subscriptions',
          'forgotten_vendors',
          'duplicate_transactions',
          'category_mismatches'
        ]
      },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: { entity_id }
      }
    );

    return NextResponse.json({
      scan_id: crypto.randomUUID(),
      status: 'completed',
      results: {
        anomalies_detected: result.anomalies,
        total_count: result.total_anomalies,
        by_severity: result.by_severity,
        total_potential_savings: result.total_potential_savings
      },
      scan_timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error running ghost hunter scan:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const entity_id = searchParams.get('entity_id');
    const status = searchParams.get('status') || 'active';

    // Get anomalies from database
    let query = supabase
      .from('anomalies')
      .select('*')
      .eq('status', status)
      .order('detected_at', { ascending: false })
      .limit(50);

    if (entity_id) {
      query = query.eq('entity_id', entity_id);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data: anomalies, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch anomalies', details: error.message },
        { status: 500 }
      );
    }

    // Group by severity
    const bySeverity = {
      critical: anomalies?.filter(a => a.severity === 'critical').length || 0,
      high: anomalies?.filter(a => a.severity === 'high').length || 0,
      medium: anomalies?.filter(a => a.severity === 'medium').length || 0,
      low: anomalies?.filter(a => a.severity === 'low').length || 0
    };

    const totalSavings = anomalies?.reduce(
      (sum, a) => sum + Number(a.potential_savings || 0), 0
    ) || 0;

    return NextResponse.json({
      anomalies,
      summary: {
        total_count: anomalies?.length || 0,
        by_severity: bySeverity,
        total_potential_savings: Math.round(totalSavings * 100) / 100
      }
    });

  } catch (error: any) {
    console.error('Error fetching anomalies:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
