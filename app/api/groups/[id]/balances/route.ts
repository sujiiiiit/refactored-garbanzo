/**
 * GET /api/groups/:id/balances - Calculate optimal settlements for group
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { splitSettlementAgent } from '@/lib/agents/split-settlement-agent';

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
      .select('role, groups(id, name, currency, is_active)')
      .eq('group_id', params.id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership || !membership.groups?.is_active) {
      return NextResponse.json(
        { error: 'Group not found or you are not a member' },
        { status: 404 }
      );
    }

    // Get all member balances
    const { data: members, error: balancesError } = await supabase
      .from('group_members')
      .select(`
        user_id,
        balance,
        role,
        joined_at,
        users(id, email, raw_user_meta_data)
      `)
      .eq('group_id', params.id)
      .order('balance', { ascending: false });

    if (balancesError) {
      return NextResponse.json(
        { error: 'Failed to fetch balances', details: balancesError.message },
        { status: 500 }
      );
    }

    // Calculate optimal settlements using agent
    const settlementResult = await splitSettlementAgent.executeSettlement(
      { group_id: params.id },
      {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: { group_id: params.id }
      }
    );

    // Format member balances with user info
    const formattedMembers = members?.map(m => ({
      user_id: m.user_id,
      email: m.users?.email,
      name: m.users?.raw_user_meta_data?.full_name || m.users?.email?.split('@')[0],
      balance: Number(m.balance),
      status: Number(m.balance) > 0.01 ? 'owed' :
              Number(m.balance) < -0.01 ? 'owes' : 'settled',
      role: m.role,
      joined_at: m.joined_at
    })) || [];

    // Calculate summary statistics
    const totalOwed = formattedMembers
      .filter(m => m.balance > 0)
      .reduce((sum, m) => sum + m.balance, 0);

    const totalOwes = Math.abs(formattedMembers
      .filter(m => m.balance < 0)
      .reduce((sum, m) => sum + m.balance, 0));

    const settledCount = formattedMembers.filter(m => m.status === 'settled').length;

    // Enrich settlements with user info
    const enrichedSettlements = settlementResult.suggested_settlements.map(s => {
      const fromMember = formattedMembers.find(m => m.user_id === s.from_user_id);
      const toMember = formattedMembers.find(m => m.user_id === s.to_user_id);

      return {
        from_user_id: s.from_user_id,
        from_name: fromMember?.name || 'Unknown',
        from_email: fromMember?.email,
        to_user_id: s.to_user_id,
        to_name: toMember?.name || 'Unknown',
        to_email: toMember?.email,
        amount: s.amount,
        currency: membership.groups?.currency || 'INR',
        reason: s.reason
      };
    });

    return NextResponse.json({
      group: {
        id: membership.groups?.id,
        name: membership.groups?.name,
        currency: membership.groups?.currency || 'INR',
        member_count: members?.length || 0
      },
      summary: {
        total_owed: Math.round(totalOwed * 100) / 100,
        total_owes: Math.round(totalOwes * 100) / 100,
        net_balance: Math.round((totalOwed - totalOwes) * 100) / 100,
        settled_members: settledCount,
        unsettled_members: formattedMembers.length - settledCount
      },
      members: formattedMembers,
      suggested_settlements: enrichedSettlements,
      settlement_stats: {
        complexity_score: settlementResult.settlement_complexity_score,
        total_transactions_needed: settlementResult.total_transactions_needed,
        optimality: settlementResult.total_transactions_needed <= (formattedMembers.length - 1)
          ? 'optimal'
          : 'near-optimal'
      }
    });

  } catch (error: any) {
    console.error('Error calculating balances:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

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

    // Parse request body
    const body = await request.json();
    const { from_user_id, to_user_id, amount } = body;

    // Verify user is admin or the payer
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.id)
      .eq('user_id', user.id)
      .single();

    if (!membership || (membership.role !== 'admin' && user.id !== from_user_id)) {
      return NextResponse.json(
        { error: 'Unauthorized to record settlement' },
        { status: 403 }
      );
    }

    // Verify both users are members
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id, balance')
      .eq('group_id', params.id)
      .in('user_id', [from_user_id, to_user_id]);

    if (members?.length !== 2) {
      return NextResponse.json(
        { error: 'Invalid user IDs' },
        { status: 400 }
      );
    }

    const fromMember = members.find(m => m.user_id === from_user_id);
    const toMember = members.find(m => m.user_id === to_user_id);

    if (!fromMember || !toMember) {
      return NextResponse.json(
        { error: 'Members not found' },
        { status: 404 }
      );
    }

    // Update balances (from owes, to is owed)
    const newFromBalance = Number(fromMember.balance) + Number(amount);
    const newToBalance = Number(toMember.balance) - Number(amount);

    await supabase
      .from('group_members')
      .update({ balance: newFromBalance })
      .eq('group_id', params.id)
      .eq('user_id', from_user_id);

    await supabase
      .from('group_members')
      .update({ balance: newToBalance })
      .eq('group_id', params.id)
      .eq('user_id', to_user_id);

    // Record settlement transaction
    const { data: settlement } = await supabase
      .from('transactions')
      .insert({
        user_id: from_user_id,
        amount: Number(amount),
        currency: 'INR',
        description: `Settlement payment to ${toMember.user_id}`,
        transaction_date: new Date().toISOString().split('T')[0],
        category: 'Settlement',
        group_id: params.id,
        source: 'settlement',
        status: 'approved',
        metadata: {
          settlement: true,
          from_user_id,
          to_user_id,
          recorded_by: user.id
        }
      })
      .select()
      .single();

    return NextResponse.json({
      settlement: {
        id: settlement?.id,
        from_user_id,
        to_user_id,
        amount: Number(amount),
        recorded_at: new Date().toISOString()
      },
      updated_balances: {
        [from_user_id]: newFromBalance,
        [to_user_id]: newToBalance
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error recording settlement:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
