/**
 * POST /api/agents/insights - Generate personalized spending insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { insightsAgent } from '@/lib/agents/insights-agent';
import { z } from 'zod';

const InsightsRequestSchema = z.object({
  entity_id: z.string().uuid().optional(),
  period: z.enum(['daily', 'weekly', 'monthly']),
  date_range: z.object({
    from: z.string(),
    to: z.string()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = InsightsRequestSchema.parse(body);

    // If entity_id provided, verify access
    if (validatedData.entity_id) {
      const { data: membership } = await supabase
        .from('entity_members')
        .select('role')
        .eq('entity_id', validatedData.entity_id)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'Entity not found or access denied' },
          { status: 404 }
        );
      }
    }

    // Execute insights agent
    const insightsResult = await insightsAgent.execute(
      {
        user_id: validatedData.entity_id ? undefined : user.id,
        entity_id: validatedData.entity_id,
        period: validatedData.period,
        date_range: validatedData.date_range
      },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: {
          entity_id: validatedData.entity_id,
          period: validatedData.period
        }
      }
    );

    return NextResponse.json({
      insights: insightsResult.insights,
      summary: insightsResult.summary,
      period: validatedData.period,
      generated_at: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error generating insights:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 422 }
      );
    }

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
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get insights from database
    let query = supabase
      .from('insights')
      .select('*')
      .eq('status', status)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (entity_id) {
      query = query.eq('entity_id', entity_id);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data: insights, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch insights', details: error.message },
        { status: 500 }
      );
    }

    // Group by type
    const byType: Record<string, number> = {};
    insights?.forEach(i => {
      byType[i.insight_type] = (byType[i.insight_type] || 0) + 1;
    });

    const actionableCount = insights?.filter(i => i.actionable).length || 0;

    return NextResponse.json({
      insights: insights?.map(i => ({
        id: i.id,
        type: i.insight_type,
        title: i.title,
        message: i.message,
        severity: i.severity,
        confidence: i.confidence,
        actionable: i.actionable,
        recommended_actions: i.recommended_actions,
        generated_at: i.generated_at,
        status: i.status
      })) || [],
      summary: {
        total_count: insights?.length || 0,
        by_type: byType,
        actionable_count: actionableCount
      }
    });

  } catch (error: any) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { insight_id, status, user_feedback } = body;

    if (!insight_id || !status) {
      return NextResponse.json(
        { error: 'insight_id and status are required' },
        { status: 400 }
      );
    }

    // Verify insight belongs to user
    const { data: insight, error: insightError } = await supabase
      .from('insights')
      .select('user_id, entity_id')
      .eq('id', insight_id)
      .single();

    if (insightError || !insight) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (insight.user_id !== user.id) {
      // Check if user has access to entity
      if (insight.entity_id) {
        const { data: membership } = await supabase
          .from('entity_members')
          .select('role')
          .eq('entity_id', insight.entity_id)
          .eq('user_id', user.id)
          .single();

        if (!membership) {
          return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Update insight
    const { data: updated, error: updateError } = await supabase
      .from('insights')
      .update({
        status,
        user_feedback,
        actioned_at: status === 'actioned' ? new Date().toISOString() : null,
        dismissed_at: status === 'dismissed' ? new Date().toISOString() : null
      })
      .eq('id', insight_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update insight', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      insight: updated,
      updated_at: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error updating insight:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
