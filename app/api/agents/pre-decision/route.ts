/**
 * POST /api/agents/pre-decision - Analyze financial impact of business decisions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { preDecisionAgent } from '@/lib/agents/pre-decision-agent';
import { z } from 'zod';

const DecisionAnalysisSchema = z.object({
  entity_id: z.string().uuid(),
  decision: z.object({
    type: z.enum(['hiring', 'tool_purchase', 'marketing_spend', 'office_expansion', 'other']),
    description: z.string().min(10),
    estimated_cost: z.number().positive(),
    frequency: z.enum(['one_time', 'monthly', 'quarterly', 'yearly']),
    expected_roi: z.number().optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']).optional()
  })
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
    const validatedData = DecisionAnalysisSchema.parse(body);

    // Verify user has admin access to entity
    const { data: membership, error: memberError } = await supabase
      .from('entity_members')
      .select('role')
      .eq('entity_id', validatedData.entity_id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Entity not found or insufficient permissions' },
        { status: 403 }
      );
    }

    // Execute pre-decision agent
    const analysisResult = await preDecisionAgent.execute(
      {
        entity_id: validatedData.entity_id,
        decision: validatedData.decision
      },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: {
          entity_id: validatedData.entity_id,
          decision_type: validatedData.decision.type
        }
      }
    );

    return NextResponse.json({
      analysis_id: crypto.randomUUID(),
      decision: validatedData.decision,
      impact_analysis: {
        runway: analysisResult.runway_impact,
        burn_rate: analysisResult.burn_rate_impact,
        risk_level: analysisResult.risk_assessment.level,
        recommendation: analysisResult.recommendation
      },
      detailed_analysis: {
        current_state: analysisResult.current_state,
        projected_state: analysisResult.projected_state,
        risk_factors: analysisResult.risk_assessment.factors,
        alternative_options: analysisResult.alternative_options
      },
      recommendations: analysisResult.recommendations,
      confidence: analysisResult.confidence,
      analyzed_at: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error analyzing decision:', error);

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

    if (!entity_id) {
      return NextResponse.json(
        { error: 'entity_id is required' },
        { status: 400 }
      );
    }

    // Verify access
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

    // Get past decision analyses from agent_events
    const { data: analyses } = await supabase
      .from('agent_events')
      .select('*')
      .eq('agent_name', 'pre_decision')
      .contains('input_data', { entity_id })
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      analyses: analyses?.map(a => ({
        id: a.id,
        decision: a.input_data?.decision,
        recommendation: a.output_data?.recommendation,
        risk_level: a.output_data?.risk_assessment?.level,
        runway_impact: a.output_data?.runway_impact,
        analyzed_at: a.created_at
      })) || [],
      count: analyses?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching decision analyses:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
