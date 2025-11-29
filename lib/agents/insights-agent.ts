/**
 * Insights Agent
 * Generates personalized spending insights and recommendations
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface InsightsInput {
  user_id?: string;
  entity_id?: string;
  period: 'daily' | 'weekly' | 'monthly';
  date_range?: {
    from: string;
    to: string;
  };
}

interface InsightsOutput {
  insights: Array<{
    type: 'spending_trend' | 'category_alert' | 'savings_opportunity' | 'budget_status' | 'prediction';
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    confidence: number;
    impact: 'low' | 'medium' | 'high';
    actionable: boolean;
    recommended_actions: string[];
    data: Record<string, any>;
  }>;
  summary: {
    total_insights: number;
    critical_count: number;
    potential_savings: number;
    overall_health_score: number;
  };
}

const analyzeSpendingTrends: AgentTool = {
  name: 'analyze_spending_trends',
  description: 'Analyze spending patterns over time',
  input_schema: {
    type: 'object',
    properties: {
      user_id: { type: 'string' },
      entity_id: { type: 'string' },
      days: { type: 'number', description: 'Number of days to analyze' }
    }
  },
  execute: async (input: any) => {
    const { user_id, entity_id, days = 30 } = input;
    const supabase = await createClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query = supabase
      .from('transactions')
      .select('amount, transaction_date, category')
      .gte('transaction_date', cutoffDate.toISOString().split('T')[0])
      .is('deleted_at', null)
      .order('transaction_date', { ascending: true });

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data: transactions } = await query;

    if (!transactions || transactions.length === 0) {
      return { trends: [], total_spend: 0 };
    }

    // Calculate weekly averages
    const weeklySpend: Record<string, number> = {};
    transactions.forEach(tx => {
      const date = new Date(tx.transaction_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      weeklySpend[weekKey] = (weeklySpend[weekKey] || 0) + Number(tx.amount);
    });

    const weeks = Object.values(weeklySpend);
    const avgWeekly = weeks.reduce((a, b) => a + b, 0) / weeks.length;

    // Calculate trend
    const recentWeeks = weeks.slice(-2);
    const olderWeeks = weeks.slice(0, -2);
    const recentAvg = recentWeeks.reduce((a, b) => a + b, 0) / recentWeeks.length;
    const olderAvg = olderWeeks.reduce((a, b) => a + b, 0) / olderWeeks.length;

    const trend = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    return {
      total_spend: transactions.reduce((sum, tx) => sum + Number(tx.amount), 0),
      weekly_average: avgWeekly,
      trend_percentage: trend,
      trend_direction: trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable',
      weeks_analyzed: weeks.length
    };
  }
};

const compareToPrevious: AgentTool = {
  name: 'compare_to_previous_period',
  description: 'Compare current period spending to previous period',
  input_schema: {
    type: 'object',
    properties: {
      user_id: { type: 'string' },
      entity_id: { type: 'string' },
      current_days: { type: 'number' }
    }
  },
  execute: async (input: any) => {
    const { user_id, entity_id, current_days = 30 } = input;
    const supabase = await createClient();

    // Current period
    const currentEnd = new Date();
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - current_days);

    // Previous period
    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - current_days);

    let currentQuery = supabase
      .from('transactions')
      .select('amount, category')
      .gte('transaction_date', currentStart.toISOString().split('T')[0])
      .lte('transaction_date', currentEnd.toISOString().split('T')[0])
      .is('deleted_at', null);

    let previousQuery = supabase
      .from('transactions')
      .select('amount, category')
      .gte('transaction_date', previousStart.toISOString().split('T')[0])
      .lte('transaction_date', previousEnd.toISOString().split('T')[0])
      .is('deleted_at', null);

    if (user_id) {
      currentQuery = currentQuery.eq('user_id', user_id);
      previousQuery = previousQuery.eq('user_id', user_id);
    }
    if (entity_id) {
      currentQuery = currentQuery.eq('entity_id', entity_id);
      previousQuery = previousQuery.eq('entity_id', entity_id);
    }

    const [{ data: currentTxns }, { data: previousTxns }] = await Promise.all([
      currentQuery,
      previousQuery
    ]);

    const currentTotal = currentTxns?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
    const previousTotal = previousTxns?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

    const change = currentTotal - previousTotal;
    const changePercentage = previousTotal > 0 ? (change / previousTotal) * 100 : 0;

    // Category comparison
    const currentByCategory: Record<string, number> = {};
    const previousByCategory: Record<string, number> = {};

    currentTxns?.forEach(tx => {
      const cat = tx.category || 'Uncategorized';
      currentByCategory[cat] = (currentByCategory[cat] || 0) + Number(tx.amount);
    });

    previousTxns?.forEach(tx => {
      const cat = tx.category || 'Uncategorized';
      previousByCategory[cat] = (previousByCategory[cat] || 0) + Number(tx.amount);
    });

    const categoryChanges = Object.keys({ ...currentByCategory, ...previousByCategory }).map(cat => ({
      category: cat,
      current: currentByCategory[cat] || 0,
      previous: previousByCategory[cat] || 0,
      change: (currentByCategory[cat] || 0) - (previousByCategory[cat] || 0),
      change_percentage: previousByCategory[cat] > 0
        ? (((currentByCategory[cat] || 0) - previousByCategory[cat]) / previousByCategory[cat]) * 100
        : 0
    })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
      current_total: currentTotal,
      previous_total: previousTotal,
      absolute_change: change,
      percentage_change: changePercentage,
      top_category_changes: categoryChanges.slice(0, 5)
    };
  }
};

const identifyAnomalies: AgentTool = {
  name: 'identify_spending_anomalies',
  description: 'Find unusual spending patterns',
  input_schema: {
    type: 'object',
    properties: {
      user_id: { type: 'string' },
      entity_id: { type: 'string' }
    }
  },
  execute: async (input: any) => {
    const { user_id, entity_id } = input;
    const supabase = await createClient();

    let query = supabase
      .from('anomalies')
      .select('*')
      .eq('status', 'active')
      .order('detected_at', { ascending: false })
      .limit(10);

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_id) query = query.eq('entity_id', entity_id);

    const { data: anomalies } = await query;

    return {
      anomalies: anomalies || [],
      count: anomalies?.length || 0,
      total_potential_savings: anomalies?.reduce((sum, a) => sum + Number(a.potential_savings || 0), 0) || 0
    };
  }
};

const SYSTEM_PROMPT = `You are a financial insights expert.

Your job is to analyze spending data and generate personalized insights.

INSIGHT TYPES:
1. spending_trend - Overall spending patterns (increasing/decreasing)
2. category_alert - Unusual category spending
3. savings_opportunity - Ways to reduce spending
4. budget_status - Budget vs actual tracking
5. prediction - Future spending predictions

SEVERITY LEVELS:
- info: FYI, no action needed
- warning: Attention recommended
- critical: Immediate action required

IMPACT LEVELS:
- low: < ₹500/month potential impact
- medium: ₹500-2000/month
- high: > ₹2000/month

For each insight, provide:
- Clear, actionable message
- Confidence score (0.0-1.0)
- Recommended actions
- Supporting data

Output JSON array:
[{
  "type": "spending_trend",
  "title": "Short title",
  "message": "Detailed message with numbers",
  "severity": "info" | "warning" | "critical",
  "confidence": 0.0-1.0,
  "impact": "low" | "medium" | "high",
  "actionable": true/false,
  "recommended_actions": ["action 1", "action 2"],
  "data": {}
}]`;

export class InsightsAgent extends BaseAgent {
  constructor() {
    super(
      'insights',
      'Generates personalized spending insights and recommendations',
      [analyzeSpendingTrends, compareToPrevious, identifyAnomalies]
    );
  }

  async execute(input: InsightsInput, context: AgentContext): Promise<InsightsOutput> {
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
      let insights: any[];
      try {
        const jsonMatch = result.response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found');
        insights = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        insights = [];
      }

      // Calculate summary
      const criticalCount = insights.filter(i => i.severity === 'critical').length;
      const potentialSavings = insights
        .filter(i => i.type === 'savings_opportunity')
        .reduce((sum, i) => sum + (i.data.monthly_savings || 0), 0);

      const healthScore = Math.max(0, 100 - (criticalCount * 20) - (insights.filter(i => i.severity === 'warning').length * 10));

      const output: InsightsOutput = {
        insights,
        summary: {
          total_insights: insights.length,
          critical_count: criticalCount,
          potential_savings: Math.round(potentialSavings * 100) / 100,
          overall_health_score: healthScore
        }
      };

      // Store insights in database
      const supabase = await createClient();
      for (const insight of insights) {
        await supabase.from('insights').insert({
          user_id: input.user_id,
          entity_id: input.entity_id,
          insight_type: insight.type,
          title: insight.title,
          message: insight.message,
          severity: insight.severity,
          confidence: insight.confidence,
          actionable: insight.actionable,
          recommended_actions: insight.recommended_actions,
          insight_data: insight.data,
          status: 'pending'
        });
      }

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
        type: 'insights.generated',
        data: {
          count: insights.length,
          critical_count: criticalCount,
          health_score: healthScore
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

  private buildPrompt(input: InsightsInput): string {
    const parts: string[] = [];

    parts.push(`Generate ${input.period} insights:`);

    if (input.user_id) {
      parts.push(`\nUser ID: ${input.user_id}`);
    }

    if (input.entity_id) {
      parts.push(`Entity ID: ${input.entity_id} (business context)`);
    }

    if (input.date_range) {
      parts.push(`\nDate range: ${input.date_range.from} to ${input.date_range.to}`);
    } else {
      const days = input.period === 'daily' ? 1 :
                   input.period === 'weekly' ? 7 : 30;
      parts.push(`\nAnalyze last ${days} days`);
    }

    parts.push('\nUse tools to:');
    parts.push('1. Analyze spending trends');
    parts.push('2. Compare to previous period');
    parts.push('3. Identify anomalies');
    parts.push('\nGenerate actionable insights with recommendations.');
    parts.push('\nReturn insights in JSON array format.');

    return parts.join('\n');
  }
}

// Export singleton instance
export const insightsAgent = new InsightsAgent();
