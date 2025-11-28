'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { calculateSplits, validateExpense } from '@/lib/split-engine';
import type { 
  Expense, 
  CreateExpenseRequest, 
  UpdateExpenseRequest,
  ExpenseParticipant 
} from '@/types';

/**
 * Get all expenses for a group
 */
export async function getGroupExpenses(
  groupId: string, 
  options?: {
    limit?: number;
    offset?: number;
    category?: string;
    settled?: boolean;
  }
) {
  const supabase = await createClient();
  
  let query = supabase
    .from('expenses')
    .select(`
      *,
      paid_by_profile:profiles!expenses_paid_by_fkey (
        id,
        full_name,
        email,
        avatar_url
      ),
      splits:expense_splits (
        id,
        user_id,
        amount,
        percentage,
        shares,
        is_paid,
        profile:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      ),
      attachments (
        id,
        file_url,
        file_name,
        file_type
      )
    `)
    .eq('group_id', groupId)
    .order('expense_date', { ascending: false });

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.settled !== undefined) {
    query = query.eq('is_settled', options.settled);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    return { error: error.message, data: null, count: 0 };
  }

  return { error: null, data, count };
}

/**
 * Get a single expense by ID
 */
export async function getExpense(expenseId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      paid_by_profile:profiles!expenses_paid_by_fkey (
        id,
        full_name,
        email,
        avatar_url
      ),
      splits:expense_splits (
        id,
        user_id,
        amount,
        percentage,
        shares,
        is_paid,
        profile:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      ),
      attachments (
        id,
        file_url,
        file_name,
        file_type,
        file_size
      )
    `)
    .eq('id', expenseId)
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Create a new expense
 */
export async function createExpense(input: CreateExpenseRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  // Calculate splits
  let calculatedSplits;
  try {
    calculatedSplits = calculateSplits(
      input.amount,
      input.split_type,
      input.participants
    );
  } catch (err) {
    return { error: (err as Error).message, data: null };
  }

  // Validate expense
  const validation = validateExpense({
    title: input.title,
    amount: input.amount,
    paid_by: input.paid_by,
    splits: calculatedSplits.map(s => ({ user_id: s.userId, amount: s.amount })),
  });

  if (!validation.valid) {
    return { error: validation.errors.join(', '), data: null };
  }

  // Create the expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      group_id: input.group_id,
      title: input.title,
      description: input.description,
      amount: input.amount,
      currency: input.currency || 'USD',
      paid_by: input.paid_by,
      category: input.category || 'other',
      split_type: input.split_type,
      expense_date: input.expense_date || new Date().toISOString().split('T')[0],
      is_recurring: input.is_recurring || false,
      recurring_interval: input.recurring_interval,
      created_by: user.id,
    })
    .select()
    .single();

  if (expenseError) {
    return { error: expenseError.message, data: null };
  }

  // Create splits
  const splitsToInsert = calculatedSplits.map(split => ({
    expense_id: expense.id,
    user_id: split.userId,
    amount: split.amount,
    percentage: 'percentage' in split ? split.percentage : null,
    shares: 'shares' in split ? split.shares : null,
  }));

  const { error: splitsError } = await supabase
    .from('expense_splits')
    .insert(splitsToInsert);

  if (splitsError) {
    // Rollback expense creation
    await supabase.from('expenses').delete().eq('id', expense.id);
    return { error: splitsError.message, data: null };
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_group_id: input.group_id,
    p_user_id: user.id,
    p_action: 'added_expense',
    p_entity_type: 'expense',
    p_entity_id: expense.id,
    p_metadata: { 
      title: expense.title, 
      amount: expense.amount,
      category: expense.category 
    },
  });

  revalidatePath(`/groups/${input.group_id}`);
  revalidatePath('/dashboard');
  
  return { error: null, data: expense };
}

/**
 * Update an expense
 */
export async function updateExpense(expenseId: string, input: UpdateExpenseRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  const { data, error } = await supabase
    .from('expenses')
    .update({
      title: input.title,
      description: input.description,
      amount: input.amount,
      category: input.category,
      expense_date: input.expense_date,
    })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  revalidatePath(`/groups/${data.group_id}`);
  
  return { error: null, data };
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Get expense for revalidation
  const { data: expense } = await supabase
    .from('expenses')
    .select('group_id')
    .eq('id', expenseId)
    .single();

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId);

  if (error) {
    return { error: error.message };
  }

  if (expense) {
    revalidatePath(`/groups/${expense.group_id}`);
  }
  revalidatePath('/dashboard');
  
  return { error: null };
}

/**
 * Mark expense as settled
 */
export async function settleExpense(expenseId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('expenses')
    .update({ is_settled: true })
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  revalidatePath(`/groups/${data.group_id}`);
  
  return { error: null, data };
}

/**
 * Update expense splits
 */
export async function updateExpenseSplits(
  expenseId: string,
  splits: ExpenseParticipant[],
  splitType: string
) {
  const supabase = await createClient();
  
  // Get current expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('amount')
    .eq('id', expenseId)
    .single();

  if (expenseError || !expense) {
    return { error: 'Expense not found' };
  }

  // Calculate new splits
  let calculatedSplits;
  try {
    calculatedSplits = calculateSplits(
      expense.amount,
      splitType as 'equal' | 'unequal' | 'percentage' | 'shares',
      splits
    );
  } catch (err) {
    return { error: (err as Error).message };
  }

  // Delete existing splits
  await supabase
    .from('expense_splits')
    .delete()
    .eq('expense_id', expenseId);

  // Insert new splits
  const splitsToInsert = calculatedSplits.map(split => ({
    expense_id: expenseId,
    user_id: split.userId,
    amount: split.amount,
    percentage: 'percentage' in split ? split.percentage : null,
    shares: 'shares' in split ? split.shares : null,
  }));

  const { error: splitsError } = await supabase
    .from('expense_splits')
    .insert(splitsToInsert);

  if (splitsError) {
    return { error: splitsError.message };
  }

  // Update split type
  await supabase
    .from('expenses')
    .update({ split_type: splitType })
    .eq('id', expenseId);

  return { error: null };
}

/**
 * Get expense statistics for a group
 */
export async function getExpenseStats(groupId: string) {
  const supabase = await createClient();
  
  // Get all expenses for the group
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('amount, category, expense_date, is_settled')
    .eq('group_id', groupId);

  if (error) {
    return { error: error.message, data: null };
  }

  // Calculate statistics
  const stats = {
    totalExpenses: 0,
    settledExpenses: 0,
    unsettledExpenses: 0,
    categoryBreakdown: {} as Record<string, number>,
    monthlySpending: {} as Record<string, number>,
  };

  expenses.forEach(expense => {
    stats.totalExpenses += expense.amount;
    
    if (expense.is_settled) {
      stats.settledExpenses += expense.amount;
    } else {
      stats.unsettledExpenses += expense.amount;
    }

    // Category breakdown
    const category = expense.category || 'other';
    stats.categoryBreakdown[category] = 
      (stats.categoryBreakdown[category] || 0) + expense.amount;

    // Monthly spending
    const month = expense.expense_date.substring(0, 7);
    stats.monthlySpending[month] = 
      (stats.monthlySpending[month] || 0) + expense.amount;
  });

  return { error: null, data: stats };
}

/**
 * Upload attachment for an expense
 */
export async function uploadExpenseAttachment(
  expenseId: string,
  file: File
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated', data: null };
  }

  const fileName = `${expenseId}/${Date.now()}_${file.name}`;
  
  // Upload file to storage
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(fileName, file);

  if (uploadError) {
    return { error: uploadError.message, data: null };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(fileName);

  // Create attachment record
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      expense_id: expenseId,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data };
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
