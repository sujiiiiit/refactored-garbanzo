/**
 * Subscription Agent
 * Detects recurring expense patterns and manages subscriptions
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface SubscriptionDetectionInput {
  user_id?: string;
  entity_id?: string;
  date_range?: {
    from: string;
    to: string;
  };
}

interface SubscriptionDetectionOutput {
  detected_subscriptions: Array<{
    merchant_name: string;
    amount: number;
    currency: string;
    billing_cycle: 'monthly' | 'quarterly' | 'yearly';
    confidence: number;
    matched_transactions: string[];
    next_billing_date: string;
    suggested_action: 'create' | 'review' | 'ignore';
    reasoning: string;
  }>;
  total_detected: number;
  total_monthly_cost: number;
}

const detectRecurringPatterns: AgentTool = {
  name: 'detect_recurring_patterns',
  description: 'Analyze transactions to find recurring subscription patterns',
  input_schema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'User ID to analyze'
      },
      entity_id: {
        type: 'string',
        description: 'Entity ID to analyze'
      },
      lookback_days: {
        type: 'number',
        description: 'Days to look back (default 90)'
      }
    },
    required: []
  },
  execute: async (input: any) => {
    const { user_id, entity_id, lookback_days = 90 } = input;
    const supabase = await createClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookback_days);

    let query = supabase
      .from('transactions')
      .select('*')
      .gte('transaction_date', cutoffDate.toISOString().split('T')[0])
      .is('deleted_at', null)
      .order('merchant_name')
      .order('transaction_date');

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data: transactions } = await query;

    if (!transactions || transactions.length === 0) {
      return { patterns: [], count: 0 };
    }

    // Group by merchant
    const merchantGroups: Record<string, any[]> = {};
    transactions.forEach(t => {
      const merchant = t.merchant_name || 'Unknown';
      if (!merchantGroups[merchant]) {
        merchantGroups[merchant] = [];
      }
      merchantGroups[merchant].push(t);
    });

    // Analyze each merchant for recurring patterns
    const patterns: any[] = [];

    Object.entries(merchantGroups).forEach(([merchant, txns]) => {
      // Need at least 2 transactions to detect pattern
      if (txns.length < 2) return;

      // Check if amounts are similar (within 10% variance)
      const amounts = txns.map(t => Number(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b) / amounts.length;
      const amountVariance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);

      if (!amountVariance) return;

      // Calculate time intervals between transactions
      const dates = txns.map(t => new Date(t.transaction_date).getTime()).sort((a, b) => a - b);
      const intervals: number[] = [];

      for (let i = 1; i < dates.length; i++) {
        const daysDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        intervals.push(daysDiff);
      }

      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;

      // Detect billing cycle
      let billingCycle: 'monthly' | 'quarterly' | 'yearly' | null = null;
      let confidence = 0;

      if (Math.abs(avgInterval - 30) < 5) {
        billingCycle = 'monthly';
        confidence = 0.9;
      } else if (Math.abs(avgInterval - 90) < 10) {
        billingCycle = 'quarterly';
        confidence = 0.85;
      } else if (Math.abs(avgInterval - 365) < 15) {
        billingCycle = 'yearly';
        confidence = 0.8;
      }

      if (billingCycle && confidence > 0.7) {
        // Calculate next billing date
        const lastDate = new Date(dates[dates.length - 1]);
        const nextDate = new Date(lastDate);

        if (billingCycle === 'monthly') {
          nextDate.setMonth(nextDate.getMonth() + 1);
        } else if (billingCycle === 'quarterly') {
          nextDate.setMonth(nextDate.getMonth() + 3);
        } else if (billingCycle === 'yearly') {
          nextDate.setFullYear(nextDate.getFullYear() + 1);
        }

        patterns.push({
          merchant,
          amount: avgAmount,
          billing_cycle: billingCycle,
          confidence,
          transaction_count: txns.length,
          transaction_ids: txns.map(t => t.id),
          next_billing_date: nextDate.toISOString().split('T')[0],
          intervals: intervals
        });
      }
    });

    return {
      patterns,
      count: patterns.length
    };
  }
};

const checkExistingSubscription: AgentTool = {
  name: 'check_existing_subscription',
  description: 'Check if subscription already exists for merchant',
  input_schema: {
    type: 'object',
    properties: {
      merchant_name: {
        type: 'string',
        description: 'Merchant name to check'
      },
      user_id: {
        type: 'string',
        description: 'User ID'
      },
      entity_id: {
        type: 'string',
        description: 'Entity ID'
      }
    },
    required: ['merchant_name']
  },
  execute: async (input: any) => {
    const { merchant_name, user_id, entity_id } = input;
    const supabase = await createClient();

    let query = supabase
      .from('subscriptions')
      .select('*')
      .ilike('merchant_name', merchant_name)
      .eq('is_active', true);

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data, error } = await query;

    return {
      exists: data && data.length > 0,
      subscriptions: data || []
    };
  }
};

const SYSTEM_PROMPT = `You are a subscription detection expert.

Your job is to analyze transaction patterns and identify recurring subscriptions.

Use the provided tools to:
1. detect_recurring_patterns - Find recurring patterns in transactions
2. check_existing_subscription - Check if subscription already tracked

For each detected pattern, determine:
- Confidence level (0.0-1.0)
- Billing cycle (monthly/quarterly/yearly)
- Next billing date
- Suggested action (create/review/ignore)

CONFIDENCE LEVELS:
- 0.9+: Highly regular pattern (create subscription)
- 0.7-0.9: Likely subscription (review recommended)
- <0.7: Uncertain (ignore)

Output JSON array:
[{
  "merchant_name": "...",
  "amount": number,
  "currency": "INR",
  "billing_cycle": "monthly" | "quarterly" | "yearly",
  "confidence": 0.0-1.0,
  "matched_transactions": ["id1", "id2"],
  "next_billing_date": "YYYY-MM-DD",
  "suggested_action": "create" | "review" | "ignore",
  "reasoning": "Why this is/isn't a subscription"
}]`;

export class SubscriptionAgent extends BaseAgent {
  constructor() {
    super(
      'subscription',
      'Detects recurring subscription patterns from transaction history',
      [detectRecurringPatterns, checkExistingSubscription]
    );
  }

  async execute(
    input: SubscriptionDetectionInput,
    context: AgentContext
  ): Promise<SubscriptionDetectionOutput> {
    const startTime = Date.now();

    try {
      const userPrompt = this.buildPrompt(input);

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        3
      );

      // Parse JSON response
      let detectedSubs: any[];
      try {
        const jsonMatch = result.response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found');
        detectedSubs = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        detectedSubs = [];
      }

      // Calculate total monthly cost
      const totalMonthlyCost = detectedSubs.reduce((sum, sub) => {
        let monthlyCost = sub.amount;
        if (sub.billing_cycle === 'quarterly') {
          monthlyCost = sub.amount / 3;
        } else if (sub.billing_cycle === 'yearly') {
          monthlyCost = sub.amount / 12;
        }
        return sum + monthlyCost;
      }, 0);

      const output: SubscriptionDetectionOutput = {
        detected_subscriptions: detectedSubs,
        total_detected: detectedSubs.length,
        total_monthly_cost: totalMonthlyCost
      };

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(
        context,
        input,
        output,
        'success',
        undefined,
        executionTime,
        result.usage.input_tokens + result.usage.output_tokens
      );

      // Emit event
      this.emitEvent({
        type: 'subscription.detected',
        data: {
          count: detectedSubs.length,
          total_monthly_cost: totalMonthlyCost
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

  private buildPrompt(input: SubscriptionDetectionInput): string {
    const parts: string[] = [];

    parts.push('Detect subscription patterns:');

    if (input.user_id) {
      parts.push(`\nUser ID: ${input.user_id}`);
    }

    if (input.entity_id) {
      parts.push(`Entity ID: ${input.entity_id}`);
    }

    if (input.date_range) {
      parts.push(`\nDate range: ${input.date_range.from} to ${input.date_range.to}`);
    } else {
      parts.push('\nDate range: Last 90 days');
    }

    parts.push('\nUse tools to:');
    parts.push('1. Detect recurring patterns in transactions');
    parts.push('2. Check if subscriptions already exist');
    parts.push('\nReturn detected subscriptions in JSON array format.');

    return parts.join('\n');
  }
}

// Export singleton instance
export const subscriptionAgent = new SubscriptionAgent();
