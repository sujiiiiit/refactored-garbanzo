/**
 * Split & Settlement Agent
 * Calculates optimal expense splits and debt settlements using graph algorithms
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface SplitInput {
  group_id: string;
  transaction_id?: string;
  amount?: number;
  payer_id: string;
  split_method: 'equal' | 'percentage' | 'exact' | 'shares';
  participants: Array<{
    user_id: string;
    amount?: number;
    percentage?: number;
    shares?: number;
  }>;
}

interface SplitOutput {
  split_id: string;
  participants: Array<{
    user_id: string;
    amount_owed: number;
    already_paid: boolean;
  }>;
  updated_balances: Record<string, {
    old_balance: number;
    new_balance: number;
    net_change: number;
  }>;
}

interface SettlementInput {
  group_id: string;
}

interface SettlementOutput {
  suggested_settlements: Array<{
    from_user_id: string;
    to_user_id: string;
    amount: number;
    reason: string;
  }>;
  settlement_complexity_score: number;
  total_transactions_needed: number;
}

const calculateEqualSplit: AgentTool = {
  name: 'calculate_equal_split',
  description: 'Divide amount equally among participants with proper rounding',
  input_schema: {
    type: 'object',
    properties: {
      total_amount: {
        type: 'number',
        description: 'Total amount to split'
      },
      participant_count: {
        type: 'number',
        description: 'Number of participants'
      }
    },
    required: ['total_amount', 'participant_count']
  },
  execute: async (input: any) => {
    const { total_amount, participant_count } = input;

    // Use cents to avoid floating point issues
    const totalCents = Math.round(total_amount * 100);
    const perPersonCents = Math.floor(totalCents / participant_count);
    const remainder = totalCents - (perPersonCents * participant_count);

    const amounts = Array(participant_count).fill(perPersonCents / 100);

    // Distribute remainder (1 cent to first N people)
    for (let i = 0; i < remainder; i++) {
      amounts[i] += 0.01;
    }

    return {
      per_person: perPersonCents / 100,
      amounts,
      total_check: amounts.reduce((sum, a) => sum + a, 0)
    };
  }
};

const optimizeSettlements: AgentTool = {
  name: 'optimize_settlements',
  description: 'Calculate minimum settlements using graph simplification algorithm',
  input_schema: {
    type: 'object',
    properties: {
      balances: {
        type: 'object',
        description: 'User balances (positive = owed, negative = owes)'
      }
    },
    required: ['balances']
  },
  execute: async (input: any) => {
    const { balances } = input;

    // Separate creditors (owed money) and debtors (owe money)
    const creditors: Array<{ user_id: string; amount: number }> = [];
    const debtors: Array<{ user_id: string; amount: number }> = [];

    Object.entries(balances).forEach(([user_id, balance]: [string, any]) => {
      const amt = Number(balance);
      if (amt > 0.01) {
        creditors.push({ user_id, amount: amt });
      } else if (amt < -0.01) {
        debtors.push({ user_id, amount: Math.abs(amt) });
      }
    });

    // Sort descending by amount
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const settlements: Array<{
      from: string;
      to: string;
      amount: number;
    }> = [];

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settleAmount = Math.min(debtor.amount, creditor.amount);

      settlements.push({
        from: debtor.user_id,
        to: creditor.user_id,
        amount: Math.round(settleAmount * 100) / 100
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return {
      settlements,
      transaction_count: settlements.length,
      complexity_score: Math.min(10, settlements.length)
    };
  }
};

const updateGroupBalances: AgentTool = {
  name: 'update_group_balances',
  description: 'Update member balances in a group after a split',
  input_schema: {
    type: 'object',
    properties: {
      group_id: {
        type: 'string',
        description: 'Group ID'
      },
      payer_id: {
        type: 'string',
        description: 'Who paid the expense'
      },
      amounts: {
        type: 'object',
        description: 'Amount each person owes'
      }
    },
    required: ['group_id', 'payer_id', 'amounts']
  },
  execute: async (input: any) => {
    const { group_id, payer_id, amounts } = input;
    const supabase = await createClient();

    // Get current balances
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id, balance')
      .eq('group_id', group_id);

    if (!members) return { error: 'Group not found' };

    const updates: Record<string, any> = {};

    // For each member
    members.forEach(member => {
      const old_balance = Number(member.balance);
      let new_balance = old_balance;

      // If this is the payer, they are owed the total minus their share
      if (member.user_id === payer_id) {
        const total_paid = Object.values(amounts).reduce((sum: number, amt: any) => sum + Number(amt), 0);
        const payer_share = Number(amounts[payer_id] || 0);
        new_balance = old_balance + (total_paid - payer_share);
      } else {
        // Others owe their share
        const owed = Number(amounts[member.user_id] || 0);
        new_balance = old_balance - owed;
      }

      updates[member.user_id] = {
        old_balance,
        new_balance,
        change: new_balance - old_balance
      };
    });

    // Update database
    for (const [user_id, data] of Object.entries(updates)) {
      await supabase
        .from('group_members')
        .update({ balance: data.new_balance })
        .eq('group_id', group_id)
        .eq('user_id', user_id);
    }

    return { updates };
  }
};

const SPLIT_PROMPT = `You are a split calculation expert for group expenses.

Your job is to accurately calculate how to split expenses among group members.

SPLIT METHODS:
1. Equal: Divide equally (use calculate_equal_split tool)
2. Percentage: Based on percentages (must sum to 100%)
3. Exact: Specified amounts (must sum to total)
4. Shares: Ratio-based (e.g., 2:1:1)

After calculating splits, use update_group_balances to update member balances.

Output JSON:
{
  "participants": [{
    "user_id": "...",
    "amount_owed": number,
    "already_paid": boolean
  }],
  "balance_updates": {...}
}`;

const SETTLEMENT_PROMPT = `You are a settlement optimization expert.

Your job is to minimize the number of transactions needed to settle all debts in a group.

Use the optimize_settlements tool with current member balances.

Algorithm: Greedy matching of max debtor to max creditor.

Output JSON:
{
  "suggested_settlements": [{
    "from_user_id": "...",
    "to_user_id": "...",
    "amount": number,
    "reason": "Settlement to balance group"
  }],
  "complexity_score": 0-10
}`;

export class SplitSettlementAgent extends BaseAgent {
  constructor() {
    super(
      'split_settlement',
      'Calculates optimal expense splits and debt settlements',
      [calculateEqualSplit, optimizeSettlements, updateGroupBalances]
    );
  }

  async executeSplit(input: SplitInput, context: AgentContext): Promise<SplitOutput> {
    const startTime = Date.now();

    try {
      const supabase = await createClient();

      // Validate split method matches participant data
      this.validateSplitInput(input);

      // Calculate amounts based on split method
      let amounts: Record<string, number> = {};

      if (input.split_method === 'equal') {
        const total = input.amount || 0;
        const result = await calculateEqualSplit.execute({
          total_amount: total,
          participant_count: input.participants.length
        }, context);

        input.participants.forEach((p, i) => {
          amounts[p.user_id] = result.amounts[i];
        });

      } else if (input.split_method === 'percentage') {
        const total = input.amount || 0;
        input.participants.forEach(p => {
          amounts[p.user_id] = Math.round((total * (p.percentage || 0) / 100) * 100) / 100;
        });

        // Adjust last participant for rounding
        const sum = Object.values(amounts).reduce((s, a) => s + a, 0);
        const diff = total - sum;
        const lastUser = input.participants[input.participants.length - 1].user_id;
        amounts[lastUser] += diff;

      } else if (input.split_method === 'exact') {
        input.participants.forEach(p => {
          amounts[p.user_id] = p.amount || 0;
        });

      } else if (input.split_method === 'shares') {
        const total = input.amount || 0;
        const totalShares = input.participants.reduce((sum, p) => sum + (p.shares || 1), 0);
        input.participants.forEach(p => {
          amounts[p.user_id] = Math.round((total * (p.shares || 1) / totalShares) * 100) / 100;
        });
      }

      // Create split record
      const { data: split, error: splitError } = await supabase
        .from('splits')
        .insert({
          transaction_id: input.transaction_id,
          group_id: input.group_id,
          payer_id: input.payer_id,
          split_method: input.split_method
        })
        .select()
        .single();

      if (splitError) throw new Error(splitError.message);

      // Create split participants
      const participants = await Promise.all(
        input.participants.map(async (p) => {
          const { data } = await supabase
            .from('split_participants')
            .insert({
              split_id: split.id,
              user_id: p.user_id,
              amount: amounts[p.user_id],
              percentage: p.percentage,
              shares: p.shares,
              paid: p.user_id === input.payer_id
            })
            .select()
            .single();

          return {
            user_id: p.user_id,
            amount_owed: amounts[p.user_id],
            already_paid: p.user_id === input.payer_id
          };
        })
      );

      // Update group balances
      const balanceResult = await updateGroupBalances.execute({
        group_id: input.group_id,
        payer_id: input.payer_id,
        amounts
      }, context);

      const output: SplitOutput = {
        split_id: split.id,
        participants,
        updated_balances: balanceResult.updates
      };

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, output, 'success', undefined, executionTime);

      // Emit event
      this.emitEvent({
        type: 'split.created',
        data: {
          split_id: split.id,
          group_id: input.group_id,
          participant_count: participants.length
        },
        timestamp: new Date().toISOString(),
        context
      });

      return output;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, null, 'failure', error.message, executionTime);
      throw error;
    }
  }

  async executeSettlement(input: SettlementInput, context: AgentContext): Promise<SettlementOutput> {
    const startTime = Date.now();

    try {
      const supabase = await createClient();

      // Get current balances
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, balance')
        .eq('group_id', input.group_id);

      if (!members) throw new Error('Group not found');

      // Build balance map
      const balances: Record<string, number> = {};
      members.forEach(m => {
        balances[m.user_id] = Number(m.balance);
      });

      // Optimize settlements
      const result = await optimizeSettlements.execute({ balances }, context);

      const output: SettlementOutput = {
        suggested_settlements: result.settlements.map((s: any) => ({
          from_user_id: s.from,
          to_user_id: s.to,
          amount: s.amount,
          reason: 'Group balance settlement'
        })),
        settlement_complexity_score: result.complexity_score,
        total_transactions_needed: result.transaction_count
      };

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, output, 'success', undefined, executionTime);

      return output;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, null, 'failure', error.message, executionTime);
      throw error;
    }
  }

  private validateSplitInput(input: SplitInput): void {
    if (input.split_method === 'percentage') {
      const totalPercentage = input.participants.reduce((sum, p) => sum + (p.percentage || 0), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new Error('Percentages must sum to 100');
      }
    }

    if (input.split_method === 'exact' && input.amount) {
      const totalAmount = input.participants.reduce((sum, p) => sum + (p.amount || 0), 0);
      if (Math.abs(totalAmount - input.amount) > 0.01) {
        throw new Error('Exact amounts must sum to total');
      }
    }

    if (input.participants.length === 0) {
      throw new Error('At least one participant required');
    }
  }

  async execute(input: any, context: AgentContext): Promise<any> {
    // Route to appropriate method
    if (input.split_method) {
      return this.executeSplit(input, context);
    } else {
      return this.executeSettlement(input, context);
    }
  }
}

// Export singleton instance
export const splitSettlementAgent = new SplitSettlementAgent();
