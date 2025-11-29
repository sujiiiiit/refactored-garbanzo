/**
 * POST /api/groups/:id/split - Create expense split for group
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { splitSettlementAgent } from '@/lib/agents/split-settlement-agent';
import { z } from 'zod';

const CreateSplitSchema = z.object({
  transaction_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  payer_id: z.string().uuid(),
  split_method: z.enum(['equal', 'percentage', 'exact', 'shares']),
  participants: z.array(z.object({
    user_id: z.string().uuid(),
    amount: z.number().optional(),
    percentage: z.number().optional(),
    shares: z.number().optional()
  })).min(1)
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateSplitSchema.parse(body);

    // Verify group exists and user is a member
    const { data: membership, error: memberError } = await supabase
      .from('group_members')
      .select('role, groups(id, name, is_active, currency)')
      .eq('group_id', params.id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership || !membership.groups?.is_active) {
      return NextResponse.json(
        { error: 'Group not found or you are not a member' },
        { status: 404 }
      );
    }

    // Verify all participants are group members
    const { data: allMembers } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', params.id);

    const memberIds = new Set(allMembers?.map(m => m.user_id) || []);
    const invalidParticipants = validatedData.participants.filter(
      p => !memberIds.has(p.user_id)
    );

    if (invalidParticipants.length > 0) {
      return NextResponse.json(
        {
          error: 'Some participants are not group members',
          invalid_user_ids: invalidParticipants.map(p => p.user_id)
        },
        { status: 400 }
      );
    }

    // Verify payer is a participant
    const payerIsParticipant = validatedData.participants.some(
      p => p.user_id === validatedData.payer_id
    );

    if (!payerIsParticipant) {
      return NextResponse.json(
        { error: 'Payer must be one of the participants' },
        { status: 400 }
      );
    }

    // Execute split using agent
    const splitResult = await splitSettlementAgent.executeSplit(
      {
        group_id: params.id,
        transaction_id: validatedData.transaction_id,
        amount: validatedData.amount,
        payer_id: validatedData.payer_id,
        split_method: validatedData.split_method,
        participants: validatedData.participants
      },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: { group_id: params.id }
      }
    );

    // Get updated member balances
    const { data: updatedMembers } = await supabase
      .from('group_members')
      .select('user_id, balance')
      .eq('group_id', params.id)
      .in('user_id', validatedData.participants.map(p => p.user_id));

    return NextResponse.json({
      split: {
        id: splitResult.split_id,
        group_id: params.id,
        payer_id: validatedData.payer_id,
        amount: validatedData.amount,
        split_method: validatedData.split_method,
        participants: splitResult.participants
      },
      balance_changes: splitResult.updated_balances,
      current_balances: updatedMembers?.reduce((acc, m) => {
        acc[m.user_id] = m.balance;
        return acc;
      }, {} as Record<string, number>)
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating split:', error);

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a member
    const { data: membership, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'Group not found or you are not a member' },
        { status: 404 }
      );
    }

    // Get all splits for this group
    const { data: splits, error: splitsError } = await supabase
      .from('splits')
      .select(`
        id,
        transaction_id,
        payer_id,
        split_method,
        created_at,
        split_participants (
          user_id,
          amount,
          percentage,
          shares,
          paid
        )
      `)
      .eq('group_id', params.id)
      .order('created_at', { ascending: false });

    if (splitsError) {
      return NextResponse.json(
        { error: 'Failed to fetch splits', details: splitsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      splits,
      count: splits?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching splits:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
