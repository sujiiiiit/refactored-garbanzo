/**
 * Ghost Hunter Agent
 * Detects duplicate subscriptions, forgotten vendors, and expense anomalies
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface GhostHunterInput {
  entity_id: string;
  scan_type: 'full' | 'incremental';
  lookback_days?: number;
  focus_areas?: string[];
}

interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affected_transactions: string[];
  potential_savings: number;
  suggested_action: string;
  confidence: number;
  detected_at: string;
}

interface GhostHunterOutput {
  scan_id: string;
  anomalies: Anomaly[];
  summary: {
    total_anomalies: number;
    by_severity: Record<string, number>;
    total_potential_savings: number;
    actionable_items: number;
  };
}

const queryDuplicateSubscriptions: AgentTool = {
  name: 'query_duplicate_subscriptions',
  description: 'Find potential duplicate subscriptions for the same service',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'Entity to scan for duplicates'
      },
      service_category: {
        type: 'string',
        description: 'Optional: Focus on specific category (e.g., "streaming", "software")'
      }
    },
    required: ['entity_id']
  },
  execute: async (input: any) => {
    const { entity_id, service_category } = input;
    const supabase = await createClient();

    let query = supabase
      .from('subscriptions')
      .select('*')
      .eq('entity_id', entity_id)
      .eq('is_active', true);

    if (service_category) {
      query = query.eq('category', service_category);
    }

    const { data: subscriptions, error } = await query;

    if (error) throw new Error(error.message);

    // Group by similar merchant names
    const groups: Record<string, any[]> = {};

    subscriptions?.forEach(sub => {
      // Normalize merchant name (lowercase, remove spaces)
      const normalized = sub.merchant_name?.toLowerCase().replace(/\s/g, '') || '';
      const baseService = normalized.split(/[_-]/)[0]; // Get base service name

      if (!groups[baseService]) {
        groups[baseService] = [];
      }
      groups[baseService].push(sub);
    });

    // Find duplicates (same base service, multiple subscriptions)
    const duplicates = Object.entries(groups)
      .filter(([_, subs]) => subs.length > 1)
      .map(([service, subs]) => ({
        service,
        subscriptions: subs,
        potential_savings: Math.min(...subs.map(s => Number(s.amount)))
      }));

    return {
      duplicates,
      count: duplicates.length
    };
  }
};

const findInactiveRecurringVendors: AgentTool = {
  name: 'find_inactive_recurring_vendors',
  description: 'Find vendors with recurring history but no recent transactions (forgotten subscriptions)',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'Entity to scan'
      },
      inactivity_days: {
        type: 'number',
        description: 'Days of inactivity to flag (default 90)'
      }
    },
    required: ['entity_id']
  },
  execute: async (input: any) => {
    const { entity_id, inactivity_days = 90 } = input;
    const supabase = await createClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactivity_days);

    // Get all transactions
    const { data: allTransactions } = await supabase
      .from('transactions')
      .select('merchant_name, amount, transaction_date')
      .eq('entity_id', entity_id)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false });

    if (!allTransactions) return { inactive_vendors: [] };

    // Group by merchant
    const merchantHistory: Record<string, any[]> = {};
    allTransactions.forEach(t => {
      const merchant = t.merchant_name || 'Unknown';
      if (!merchantHistory[merchant]) {
        merchantHistory[merchant] = [];
      }
      merchantHistory[merchant].push(t);
    });

    // Find merchants with recurring pattern but now inactive
    const inactiveVendors = Object.entries(merchantHistory)
      .filter(([merchant, txns]) => {
        // Must have at least 3 transactions (recurring pattern)
        if (txns.length < 3) return false;

        // Latest transaction must be before cutoff
        const latestDate = new Date(txns[0].transaction_date);
        if (latestDate > cutoffDate) return false;

        // Check if amounts are similar (±20% variance)
        const amounts = txns.map(t => Number(t.amount));
        const avgAmount = amounts.reduce((a, b) => a + b) / amounts.length;
        const variance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.2);

        return variance;
      })
      .map(([merchant, txns]) => {
        const avgAmount = txns.reduce((sum, t) => sum + Number(t.amount), 0) / txns.length;
        const daysSinceLastTransaction = Math.floor(
          (Date.now() - new Date(txns[0].transaction_date).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          merchant,
          transaction_count: txns.length,
          average_amount: avgAmount,
          last_transaction_date: txns[0].transaction_date,
          days_inactive: daysSinceLastTransaction,
          estimated_waste: avgAmount * Math.floor(daysSinceLastTransaction / 30) // Monthly waste
        };
      });

    return {
      inactive_vendors: inactiveVendors,
      count: inactiveVendors.length
    };
  }
};

const detectExactDuplicates: AgentTool = {
  name: 'detect_exact_duplicates',
  description: 'Find duplicate transactions (same amount, merchant, and date)',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'Entity to scan'
      },
      time_window_hours: {
        type: 'number',
        description: 'Time window for duplicate detection (default 24 hours)'
      }
    },
    required: ['entity_id']
  },
  execute: async (input: any) => {
    const { entity_id, time_window_hours = 24 } = input;
    const supabase = await createClient();

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('entity_id', entity_id)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .limit(1000);

    if (!transactions) return { duplicates: [] };

    const duplicates: any[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const t1 = transactions[i];
      const key1 = `${t1.amount}_${t1.merchant_name}_${t1.transaction_date}`;

      if (seen.has(key1)) continue;

      const group = [t1];

      // Find matching transactions
      for (let j = i + 1; j < transactions.length; j++) {
        const t2 = transactions[j];

        // Check if same amount, merchant, and within time window
        if (
          t1.amount === t2.amount &&
          t1.merchant_name === t2.merchant_name &&
          Math.abs(new Date(t1.created_at).getTime() - new Date(t2.created_at).getTime()) <
            time_window_hours * 60 * 60 * 1000
        ) {
          group.push(t2);
          seen.add(`${t2.amount}_${t2.merchant_name}_${t2.transaction_date}`);
        }
      }

      if (group.length > 1) {
        duplicates.push({
          amount: t1.amount,
          merchant: t1.merchant_name,
          date: t1.transaction_date,
          transaction_ids: group.map(t => t.id),
          count: group.length,
          sources: group.map(t => t.source)
        });
      }

      seen.add(key1);
    }

    return {
      duplicates,
      count: duplicates.length
    };
  }
};

const SYSTEM_PROMPT = `You are the Ghost Expense Hunter, an AI agent that detects wasteful spending and anomalies.

Your job is to analyze entity expenses and find:
1. Duplicate subscriptions (same service, multiple plans)
2. Forgotten vendors (recurring history, then inactive)
3. Duplicate transactions
4. Unusual patterns

Use the provided tools to query data, then analyze results.

SEVERITY LEVELS:
- Low: < ₹500/month potential savings
- Medium: ₹500-2000/month
- High: ₹2000-10000/month
- Critical: > ₹10000/month or data quality issues

Output JSON array of anomalies:
[{
  "type": "duplicate_subscription" | "forgotten_vendor" | "duplicate_transaction",
  "severity": "low" | "medium" | "high" | "critical",
  "title": "Brief title",
  "description": "What's wrong",
  "affected_transactions": ["id1", "id2"],
  "potential_savings": number,
  "suggested_action": "What to do",
  "confidence": 0.0-1.0,
  "reasoning": "Why flagged"
}]

Be precise. Only flag real anomalies, not normal variance.`;

export class GhostHunterAgent extends BaseAgent {
  constructor() {
    super(
      'ghost_hunter',
      'Detects expense anomalies, duplicates, and wasteful spending',
      [queryDuplicateSubscriptions, findInactiveRecurringVendors, detectExactDuplicates]
    );
  }

  async execute(input: GhostHunterInput, context: AgentContext): Promise<GhostHunterOutput> {
    const startTime = Date.now();
    const scan_id = crypto.randomUUID();

    try {
      const userPrompt = this.buildPrompt(input);

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        5
      );

      // Parse anomalies from response
      let anomalies: Anomaly[];
      try {
        const jsonMatch = result.response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found');
        anomalies = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        anomalies = [];
      }

      // Add metadata to each anomaly
      anomalies = anomalies.map(a => ({
        ...a,
        detected_at: new Date().toISOString()
      }));

      // Calculate summary
      const summary = {
        total_anomalies: anomalies.length,
        by_severity: anomalies.reduce((acc, a) => {
          acc[a.severity] = (acc[a.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        total_potential_savings: anomalies.reduce((sum, a) => sum + (a.potential_savings || 0), 0),
        actionable_items: anomalies.filter(a => a.severity === 'high' || a.severity === 'critical').length
      };

      // Save anomalies to database
      const supabase = await createClient();
      for (const anomaly of anomalies) {
        await supabase.from('anomalies').insert({
          entity_id: input.entity_id,
          type: anomaly.type,
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          related_transactions: anomaly.affected_transactions,
          suggested_action: anomaly.suggested_action,
          potential_savings: anomaly.potential_savings,
          detected_by: 'ghost_hunter',
          detection_metadata: { scan_id },
          confidence: anomaly.confidence
        });
      }

      const output: GhostHunterOutput = {
        scan_id,
        anomalies,
        summary
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

      // Emit events
      this.emitEvent({
        type: 'ghost_hunter.scan_completed',
        data: {
          scan_id,
          anomalies_found: anomalies.length,
          total_savings: summary.total_potential_savings
        },
        timestamp: new Date().toISOString(),
        context
      });

      if (summary.actionable_items > 0) {
        this.emitEvent({
          type: 'ghost_hunter.critical_anomalies',
          data: {
            scan_id,
            critical_count: summary.actionable_items,
            entity_id: input.entity_id
          },
          timestamp: new Date().toISOString(),
          context
        });
      }

      return output;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      await this.logExecution(
        context,
        input,
        null,
        'failure',
        error.message,
        executionTime
      );

      throw error;
    }
  }

  private buildPrompt(input: GhostHunterInput): string {
    const parts: string[] = [];

    parts.push(`Scan entity for expense anomalies:`);
    parts.push(`Entity ID: ${input.entity_id}`);
    parts.push(`Scan type: ${input.scan_type}`);
    parts.push(`Lookback period: ${input.lookback_days || 90} days`);

    if (input.focus_areas && input.focus_areas.length > 0) {
      parts.push(`Focus areas: ${input.focus_areas.join(', ')}`);
    }

    parts.push('\nUse the provided tools to:');
    parts.push('1. query_duplicate_subscriptions - find duplicate subscriptions');
    parts.push('2. find_inactive_recurring_vendors - find forgotten subscriptions');
    parts.push('3. detect_exact_duplicates - find duplicate transactions');

    parts.push('\nThen analyze and return anomalies in JSON array format.');

    return parts.join('\n');
  }
}

// Export singleton instance
export const ghostHunterAgent = new GhostHunterAgent();
