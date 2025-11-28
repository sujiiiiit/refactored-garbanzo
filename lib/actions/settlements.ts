'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { simplifyDebts, calculateGroupBalances } from '@/lib/split-engine';
import type { 
  Settlement, 
  CreateSettlementRequest,
  DebtSimplification 
} from '@/types';

/**
 * Get all settlements for a group
 */
export async function getGroupSettlements(
  groupId: string,
  options?: {
    status?: 'pending' | 'completed' | 'cancelled';
    limit?: number;
    offset?: number;
  }
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('settlements')
    .select(`
      *,
      from_profile:profiles!settlements_from_user_fkey (
        id,
        full_name,
        email,
        avatar_url
      ),
      to_profile:profiles!settlements_to_user_fkey (
        id,
        full_name,
        email,
        avatar_url
      )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Get a single settlement by ID
 */
export async function getSettlement(settlementId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('settlements')
    .select(`
      *,
      from_profile:profiles!settlements_from_user_fkey (
        id,
        full_name,
        email,
        avatar_url
      ),
      to_profile:profiles!settlements_to_user_fkey (
        id,
        full_name,
        email,
        avatar_url
      )
    `)
    .eq('id', settlementId)
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Create a new settlement
 */
export async function createSettlement(input: CreateSettlementRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Validate amount
  if (input.amount <= 0) {
    return { error: 'Amount must be greater than 0', data: null };
  }

  // Validate from and to users are different
  if (input.from_user === input.to_user) {
    return { error: 'Cannot settle with yourself', data: null };
  }

  // Create the settlement
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: input.group_id,
      from_user: input.from_user,
      to_user: input.to_user,
      amount: input.amount,
      currency: input.currency || 'USD',
      status: 'pending',
      payment_method: input.payment_method,
      payment_reference: input.payment_reference,
      notes: input.notes,
    })
    .select(`
      *,
      from_profile:profiles!settlements_from_user_fkey (
        id,
        full_name
      ),
      to_profile:profiles!settlements_to_user_fkey (
        id,
        full_name
      )
    `)
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_group_id: input.group_id,
    p_user_id: user.id,
    p_action: 'created_settlement',
    p_entity_type: 'settlement',
    p_entity_id: data.id,
    p_metadata: { 
      amount: data.amount,
      from: data.from_profile?.full_name,
      to: data.to_profile?.full_name,
    },
  });

  revalidatePath(`/groups/${input.group_id}`);
  revalidatePath('/dashboard');
  
  return { error: null, data };
}

/**
 * Mark settlement as completed
 */
export async function completeSettlement(settlementId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  const { data, error } = await supabase
    .from('settlements')
    .update({
      status: 'completed',
      settled_at: new Date().toISOString(),
    })
    .eq('id', settlementId)
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_group_id: data.group_id,
    p_user_id: user.id,
    p_action: 'completed_settlement',
    p_entity_type: 'settlement',
    p_entity_id: data.id,
    p_metadata: { amount: data.amount },
  });

  revalidatePath(`/groups/${data.group_id}`);
  
  return { error: null, data };
}

/**
 * Cancel a settlement
 */
export async function cancelSettlement(settlementId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('settlements')
    .update({ status: 'cancelled' })
    .eq('id', settlementId)
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  revalidatePath(`/groups/${data.group_id}`);
  
  return { error: null, data };
}

/**
 * Delete a settlement
 */
export async function deleteSettlement(settlementId: string) {
  const supabase = await createClient();
  
  // Get settlement for revalidation
  const { data: settlement } = await supabase
    .from('settlements')
    .select('group_id')
    .eq('id', settlementId)
    .single();

  const { error } = await supabase
    .from('settlements')
    .delete()
    .eq('id', settlementId);

  if (error) {
    return { error: error.message };
  }

  if (settlement) {
    revalidatePath(`/groups/${settlement.group_id}`);
  }
  
  return { error: null };
}

/**
 * Get suggested settlements (who owes whom)
 */
export async function getSuggestedSettlements(groupId: string): Promise<{
  error: string | null;
  data: DebtSimplification[] | null;
}> {
  const supabase = await createClient();
  
  // Get group members
  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profile:profiles (
        id,
        full_name,
        email
      )
    `)
    .eq('group_id', groupId);

  if (membersError) {
    return { error: membersError.message, data: null };
  }

  // Get unsettled expenses with splits
  const { data: expenses, error: expensesError } = await supabase
    .from('expenses')
    .select(`
      id,
      amount,
      paid_by,
      is_settled,
      splits:expense_splits (
        user_id,
        amount
      )
    `)
    .eq('group_id', groupId)
    .eq('is_settled', false);

  if (expensesError) {
    return { error: expensesError.message, data: null };
  }

  // Get completed settlements to factor in
  const { data: settlements, error: settlementsError } = await supabase
    .from('settlements')
    .select('from_user, to_user, amount')
    .eq('group_id', groupId)
    .eq('status', 'completed');

  if (settlementsError) {
    return { error: settlementsError.message, data: null };
  }

  // Calculate balances
  const balanceMap = new Map<string, number>();

  // Initialize balances for all members
  members.forEach(member => {
    balanceMap.set(member.user_id, 0);
  });

  // Process expenses
  expenses.forEach(expense => {
    if (expense.paid_by) {
      balanceMap.set(
        expense.paid_by,
        (balanceMap.get(expense.paid_by) || 0) + expense.amount
      );
    }

    expense.splits?.forEach(split => {
      balanceMap.set(
        split.user_id,
        (balanceMap.get(split.user_id) || 0) - split.amount
      );
    });
  });

  // Adjust for completed settlements
  settlements.forEach(settlement => {
    if (settlement.from_user) {
      balanceMap.set(
        settlement.from_user,
        (balanceMap.get(settlement.from_user) || 0) + settlement.amount
      );
    }
    if (settlement.to_user) {
      balanceMap.set(
        settlement.to_user,
        (balanceMap.get(settlement.to_user) || 0) - settlement.amount
      );
    }
  });

  // Convert to GroupBalance format
  const memberMap = new Map(
    members.map(m => {
      // Supabase returns single object but TS types it as array
      const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
      return [m.user_id, profile];
    })
  );

  const balances = Array.from(balanceMap.entries()).map(([userId, balance]) => {
    const profile = memberMap.get(userId);
    return {
      group_id: groupId,
      user_id: userId,
      full_name: profile?.full_name || profile?.email || 'Unknown',
      email: profile?.email || '',
      total_paid: 0,
      total_owed: 0,
      balance,
    };
  });

  // Simplify debts
  const simplifiedDebts = simplifyDebts(balances);

  return { error: null, data: simplifiedDebts };
}

/**
 * Get settlement statistics for a group
 */
export async function getSettlementStats(groupId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('settlements')
    .select('amount, status')
    .eq('group_id', groupId);

  if (error) {
    return { error: error.message, data: null };
  }

  const stats = {
    totalSettled: 0,
    pendingAmount: 0,
    completedCount: 0,
    pendingCount: 0,
  };

  data.forEach(settlement => {
    if (settlement.status === 'completed') {
      stats.totalSettled += settlement.amount;
      stats.completedCount++;
    } else if (settlement.status === 'pending') {
      stats.pendingAmount += settlement.amount;
      stats.pendingCount++;
    }
  });

  return { error: null, data: stats };
}

/**
 * Get user's settlements across all groups
 */
export async function getUserSettlements(status?: 'pending' | 'completed' | 'cancelled') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  let query = supabase
    .from('settlements')
    .select(`
      *,
      group:groups (
        id,
        name
      ),
      from_profile:profiles!settlements_from_user_fkey (
        id,
        full_name,
        avatar_url
      ),
      to_profile:profiles!settlements_to_user_fkey (
        id,
        full_name,
        avatar_url
      )
    `)
    .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}
