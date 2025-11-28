/**
 * SmartSplit Engine - Core expense splitting and settlement calculation
 * 
 * This module handles:
 * - Equal, unequal, percentage, and share-based splits
 * - Balance calculation for group members
 * - Debt simplification using graph optimization
 * - Settlement suggestions
 */

import type { 
  Expense, 
  ExpenseSplit, 
  GroupBalance, 
  DebtSimplification,
  Profile,
  SplitType,
  ExpenseParticipant
} from '@/types';

// ============================================
// Split Calculation Functions
// ============================================

/**
 * Calculate split amounts based on split type
 */
export function calculateSplits(
  amount: number,
  splitType: SplitType,
  participants: ExpenseParticipant[]
): { userId: string; amount: number; percentage?: number; shares?: number }[] {
  const activeParticipants = participants.filter(p => p.user_id);
  
  if (activeParticipants.length === 0) {
    throw new Error('At least one participant is required');
  }

  switch (splitType) {
    case 'equal':
      return calculateEqualSplit(amount, activeParticipants);
    case 'unequal':
      return calculateUnequalSplit(amount, activeParticipants);
    case 'percentage':
      return calculatePercentageSplit(amount, activeParticipants);
    case 'shares':
      return calculateSharesSplit(amount, activeParticipants);
    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }
}

/**
 * Equal split - divide amount equally among all participants
 */
function calculateEqualSplit(
  amount: number,
  participants: ExpenseParticipant[]
): { userId: string; amount: number }[] {
  const count = participants.length;
  const baseAmount = Math.floor((amount * 100) / count) / 100;
  const remainder = Math.round((amount - baseAmount * count) * 100) / 100;
  
  return participants.map((p, index) => ({
    userId: p.user_id,
    amount: index === 0 ? baseAmount + remainder : baseAmount,
  }));
}

/**
 * Unequal split - use specified amounts
 */
function calculateUnequalSplit(
  amount: number,
  participants: ExpenseParticipant[]
): { userId: string; amount: number }[] {
  const totalSpecified = participants.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  if (Math.abs(totalSpecified - amount) > 0.01) {
    throw new Error(
      `Split amounts (${totalSpecified}) don't match total (${amount})`
    );
  }

  return participants.map(p => ({
    userId: p.user_id,
    amount: Number(p.amount) || 0,
  }));
}

/**
 * Percentage split - divide by specified percentages
 */
function calculatePercentageSplit(
  amount: number,
  participants: ExpenseParticipant[]
): { userId: string; amount: number; percentage: number }[] {
  const totalPercentage = participants.reduce(
    (sum, p) => sum + (Number(p.percentage) || 0),
    0
  );

  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(
      `Percentages must add up to 100% (got ${totalPercentage}%)`
    );
  }

  return participants.map(p => {
    const percentage = Number(p.percentage) || 0;
    return {
      userId: p.user_id,
      amount: Math.round((amount * percentage) / 100 * 100) / 100,
      percentage,
    };
  });
}

/**
 * Shares split - divide proportionally based on shares
 */
function calculateSharesSplit(
  amount: number,
  participants: ExpenseParticipant[]
): { userId: string; amount: number; shares: number }[] {
  const totalShares = participants.reduce(
    (sum, p) => sum + (Number(p.shares) || 1),
    0
  );

  if (totalShares === 0) {
    throw new Error('Total shares cannot be zero');
  }

  return participants.map(p => {
    const shares = Number(p.shares) || 1;
    return {
      userId: p.user_id,
      amount: Math.round((amount * shares) / totalShares * 100) / 100,
      shares,
    };
  });
}

// ============================================
// Balance Calculation Functions
// ============================================

/**
 * Calculate balances for all members in a group
 */
export function calculateGroupBalances(
  expenses: Expense[],
  members: { user_id: string; profile?: Profile }[]
): GroupBalance[] {
  const balanceMap = new Map<string, GroupBalance>();

  // Initialize balances for all members
  members.forEach(member => {
    balanceMap.set(member.user_id, {
      group_id: '',
      user_id: member.user_id,
      full_name: member.profile?.full_name || member.profile?.email || 'Unknown',
      email: member.profile?.email || '',
      total_paid: 0,
      total_owed: 0,
      balance: 0,
    });
  });

  // Calculate totals from expenses
  expenses.forEach(expense => {
    if (expense.is_settled) return;

    // Add to payer's total_paid
    if (expense.paid_by) {
      const payerBalance = balanceMap.get(expense.paid_by);
      if (payerBalance) {
        payerBalance.total_paid += expense.amount;
      }
    }

    // Add to each participant's total_owed
    expense.splits?.forEach(split => {
      const participantBalance = balanceMap.get(split.user_id);
      if (participantBalance) {
        participantBalance.total_owed += split.amount;
      }
    });
  });

  // Calculate final balance
  balanceMap.forEach(balance => {
    balance.balance = balance.total_paid - balance.total_owed;
  });

  return Array.from(balanceMap.values());
}

/**
 * Calculate who owes whom using debt simplification
 */
export function simplifyDebts(balances: GroupBalance[]): DebtSimplification[] {
  const debts: DebtSimplification[] = [];
  
  // Separate into creditors (positive balance) and debtors (negative balance)
  const creditors: { id: string; name: string; amount: number }[] = [];
  const debtors: { id: string; name: string; amount: number }[] = [];

  balances.forEach(b => {
    if (b.balance > 0.01) {
      creditors.push({ id: b.user_id, name: b.full_name, amount: b.balance });
    } else if (b.balance < -0.01) {
      debtors.push({ id: b.user_id, name: b.full_name, amount: Math.abs(b.balance) });
    }
  });

  // Sort by amount (largest first) for optimal simplification
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // Greedy algorithm to minimize number of transactions
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];

    const amount = Math.min(creditor.amount, debtor.amount);
    
    if (amount > 0.01) {
      debts.push({
        from: debtor.id,
        from_name: debtor.name,
        to: creditor.id,
        to_name: creditor.name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < 0.01) i++;
    if (debtor.amount < 0.01) j++;
  }

  return debts;
}

// ============================================
// Settlement Suggestions
// ============================================

/**
 * Get suggested settlements for a group
 */
export function getSuggestedSettlements(
  expenses: Expense[],
  members: { user_id: string; profile?: Profile }[]
): DebtSimplification[] {
  const balances = calculateGroupBalances(expenses, members);
  return simplifyDebts(balances);
}

// ============================================
// Statistics & Analytics
// ============================================

/**
 * Calculate spending statistics for a group
 */
export function calculateGroupStats(expenses: Expense[]) {
  const stats = {
    totalExpenses: 0,
    expenseCount: expenses.length,
    averageExpense: 0,
    categoryBreakdown: {} as Record<string, number>,
    monthlySpending: {} as Record<string, number>,
    topSpenders: [] as { userId: string; amount: number }[],
  };

  const spenderMap = new Map<string, number>();

  expenses.forEach(expense => {
    stats.totalExpenses += expense.amount;

    // Category breakdown
    const category = expense.category || 'other';
    stats.categoryBreakdown[category] = 
      (stats.categoryBreakdown[category] || 0) + expense.amount;

    // Monthly spending
    const month = expense.expense_date.substring(0, 7); // YYYY-MM
    stats.monthlySpending[month] = 
      (stats.monthlySpending[month] || 0) + expense.amount;

    // Top spenders
    if (expense.paid_by) {
      spenderMap.set(
        expense.paid_by,
        (spenderMap.get(expense.paid_by) || 0) + expense.amount
      );
    }
  });

  stats.averageExpense = 
    expenses.length > 0 ? stats.totalExpenses / expenses.length : 0;

  stats.topSpenders = Array.from(spenderMap.entries())
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);

  return stats;
}

/**
 * Calculate individual user statistics within a group
 */
export function calculateUserStats(
  userId: string,
  expenses: Expense[],
  members: { user_id: string; profile?: Profile }[]
) {
  const userExpenses = expenses.filter(e => e.paid_by === userId);
  const balances = calculateGroupBalances(expenses, members);
  const userBalance = balances.find(b => b.user_id === userId);

  return {
    totalPaid: userBalance?.total_paid || 0,
    totalOwed: userBalance?.total_owed || 0,
    balance: userBalance?.balance || 0,
    expenseCount: userExpenses.length,
    averageExpense: 
      userExpenses.length > 0 
        ? userExpenses.reduce((sum, e) => sum + e.amount, 0) / userExpenses.length 
        : 0,
  };
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate expense data before saving
 */
export function validateExpense(expense: {
  title: string;
  amount: number;
  paid_by: string;
  splits: { user_id: string; amount: number }[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!expense.title?.trim()) {
    errors.push('Title is required');
  }

  if (!expense.amount || expense.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }

  if (!expense.paid_by) {
    errors.push('Payer is required');
  }

  if (!expense.splits || expense.splits.length === 0) {
    errors.push('At least one participant is required');
  }

  const totalSplit = expense.splits?.reduce((sum, s) => sum + s.amount, 0) || 0;
  if (Math.abs(totalSplit - expense.amount) > 0.01) {
    errors.push(`Split amounts (${totalSplit}) must equal total (${expense.amount})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Currency Formatting
// ============================================

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const symbol = currencySymbols[currency] || currency + ' ';
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function getCurrencySymbol(currency: string): string {
  return currencySymbols[currency] || currency;
}
