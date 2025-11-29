/**
 * POST /api/agents/cashflow-balance - Optimize cash allocation across entities
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cashflowBalancerAgent } from '@/lib/agents/cashflow-balancer-agent';
import { z } from 'zod';

const CashflowOptimizationSchema = z.object({
  entity_ids: z.array(z.string().uuid()).optional(),
  optimization_goal: z.enum(['maximize_runway', 'minimize_risk', 'balanced']),
  constraints: z.object({
    min_cash_per_entity: z.number().positive().optional(),
    max_transfer_amount: z.number().positive().optional(),
    preserve_ratios: z.boolean().optional()
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
    const validatedData = CashflowOptimizationSchema.parse(body);

    // Verify user is admin of at least one entity
    const { data: memberships } = await supabase
      .from('entity_members')
      .select('entity_id, role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (!memberships || memberships.length < 2) {
      return NextResponse.json(
        { error: 'Need admin access to at least 2 entities for cashflow optimization' },
        { status: 403 }
      );
    }

    // Execute cashflow balancer agent
    const optimizationResult = await cashflowBalancerAgent.execute(
      {
        user_id: user.id,
        entity_ids: validatedData.entity_ids,
        optimization_goal: validatedData.optimization_goal,
        constraints: validatedData.constraints
      },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: {
          goal: validatedData.optimization_goal
        }
      }
    );

    return NextResponse.json({
      optimization_id: crypto.randomUUID(),
      current_state: optimizationResult.current_state,
      optimization: optimizationResult.optimization,
      optimized_state: optimizationResult.optimized_state,
      recommendations: optimizationResult.recommendations,
      risk_assessment: optimizationResult.risk_assessment,
      optimized_at: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error optimizing cashflow:', error);

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

    // Get past cashflow optimizations
    const { data: optimizations, error } = await supabase
      .from('cashflow_optimizations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch optimizations', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      optimizations: optimizations?.map(o => ({
        id: o.id,
        optimization_goal: o.optimization_goal,
        transfers_count: o.suggested_transfers?.length || 0,
        total_amount: o.suggested_transfers?.reduce((sum: number, t: any) => sum + t.amount, 0) || 0,
        executed: o.executed,
        created_at: o.created_at
      })) || [],
      count: optimizations?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching cashflow optimizations:', error);
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
    const { optimization_id, execute } = body;

    if (!optimization_id || execute !== true) {
      return NextResponse.json(
        { error: 'optimization_id and execute: true required' },
        { status: 400 }
      );
    }

    // Get optimization
    const { data: optimization, error: optError } = await supabase
      .from('cashflow_optimizations')
      .select('*')
      .eq('id', optimization_id)
      .eq('user_id', user.id)
      .single();

    if (optError || !optimization) {
      return NextResponse.json(
        { error: 'Optimization not found' },
        { status: 404 }
      );
    }

    if (optimization.executed) {
      return NextResponse.json(
        { error: 'Optimization already executed' },
        { status: 409 }
      );
    }

    // Execute transfers (update entity cash balances)
    const transfers = optimization.suggested_transfers as any[];
    const executedTransfers = [];

    for (const transfer of transfers) {
      // Deduct from source entity
      const { error: fromError } = await supabase.rpc('decrement_entity_cash', {
        p_entity_id: transfer.from_entity_id,
        p_amount: transfer.amount
      });

      // Add to destination entity
      const { error: toError } = await supabase.rpc('increment_entity_cash', {
        p_entity_id: transfer.to_entity_id,
        p_amount: transfer.amount
      });

      if (!fromError && !toError) {
        executedTransfers.push(transfer);

        // Log transfer as transaction
        await supabase.from('transactions').insert({
          entity_id: transfer.from_entity_id,
          amount: -transfer.amount,
          currency: 'INR',
          description: `Cashflow optimization transfer to ${transfer.to_entity_name}`,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'Internal Transfer',
          source: 'cashflow_optimization',
          status: 'approved',
          metadata: {
            optimization_id,
            transfer_to: transfer.to_entity_id,
            reason: transfer.reason
          }
        });
      }
    }

    // Mark optimization as executed
    await supabase
      .from('cashflow_optimizations')
      .update({ executed: true, executed_at: new Date().toISOString() })
      .eq('id', optimization_id);

    return NextResponse.json({
      optimization_id,
      executed: true,
      transfers_executed: executedTransfers.length,
      total_transferred: executedTransfers.reduce((sum, t) => sum + t.amount, 0),
      executed_at: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error executing cashflow optimization:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
