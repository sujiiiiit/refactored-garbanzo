/**
 * Pre-Decision Agent
 * Simulates financial impact of business decisions (hiring, tool purchases, etc.)
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface PreDecisionInput {
  entity_id: string;
  decision: {
    type: 'hire' | 'tool_purchase' | 'marketing_spend' | 'office_expansion' | 'other';
    description: string;
    estimated_cost: number;
    is_recurring: boolean;
    recurring_frequency?: 'monthly' | 'quarterly' | 'yearly';
  };
  context?: {
    current_team_size?: number;
    current_revenue?: number;
    fundraise_planned?: boolean;
  };
}

interface PreDecisionOutput {
  analysis: {
    runway_impact: {
      current_runway_months: number;
      new_runway_months: number;
      runway_reduction_months: number;
      zero_cash_date: string;
      zero_cash_date_with_decision: string;
    };
    burn_rate_impact: {
      current_monthly_burn: number;
      new_monthly_burn: number;
      percentage_increase: number;
    };
    risk_assessment: {
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      risk_factors: string[];
      mitigation_suggestions: string[];
    };
    alternatives: Array<{
      option: string;
      cost: number;
      pros: string[];
      cons: string[];
      runway_impact_months: number;
    }>;
    recommendation: {
      verdict: 'proceed' | 'proceed_with_caution' | 'defer' | 'reject';
      reasoning: string;
      conditions?: string[];
    };
  };
  metadata: {
    generated_at: string;
    assumptions: string[];
    confidence: number;
  };
}

const getEntityBurnRate: AgentTool = {
  name: 'get_entity_burn_rate',
  description: 'Get current burn rate and runway for entity',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'UUID of the entity'
      },
      period_days: {
        type: 'number',
        description: 'Days to calculate burn over (default 30)'
      }
    },
    required: ['entity_id']
  },
  execute: async (input: any) => {
    const { entity_id, period_days = 30 } = input;
    const supabase = await createClient();

    // Get entity details
    const { data: entity } = await supabase
      .from('entities')
      .select('*')
      .eq('id', entity_id)
      .single();

    if (!entity) throw new Error('Entity not found');

    // Calculate burn rate from transactions
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - period_days);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount, transaction_date')
      .eq('entity_id', entity_id)
      .gte('transaction_date', cutoffDate.toISOString())
      .is('deleted_at', null);

    const total_spend = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const daily_burn = total_spend / period_days;
    const monthly_burn = daily_burn * 30;

    // Get latest burn rate from history (if available)
    const { data: burnHistory } = await supabase
      .from('burn_rate_history')
      .select('monthly_burn')
      .eq('entity_id', entity_id)
      .order('time', { ascending: false })
      .limit(1);

    const historical_monthly_burn = burnHistory?.[0]?.monthly_burn;

    // Estimate current cash (would need actual data source)
    // For now, use entity metadata or monthly_burn_target
    const estimated_cash = entity.monthly_burn_target
      ? entity.monthly_burn_target * (entity.runway_months || 6)
      : monthly_burn * 6;

    const runway_months = monthly_burn > 0 ? estimated_cash / monthly_burn : 999;

    return {
      current_cash: estimated_cash,
      monthly_burn: monthly_burn,
      daily_burn: daily_burn,
      runway_months: runway_months,
      monthly_revenue: 0, // Would need revenue tracking
      period_days: period_days
    };
  }
};

const simulateDecisionImpact: AgentTool = {
  name: 'simulate_decision_impact',
  description: 'Simulate runway impact of a financial decision',
  input_schema: {
    type: 'object',
    properties: {
      current_cash: {
        type: 'number',
        description: 'Current cash balance'
      },
      current_burn: {
        type: 'number',
        description: 'Current monthly burn rate'
      },
      decision_cost: {
        type: 'number',
        description: 'Cost of the decision'
      },
      is_recurring: {
        type: 'boolean',
        description: 'Is this a recurring cost?'
      },
      recurring_frequency_months: {
        type: 'number',
        description: 'Frequency in months (1 for monthly, 3 for quarterly, 12 for yearly)'
      }
    },
    required: ['current_cash', 'current_burn', 'decision_cost', 'is_recurring']
  },
  execute: async (input: any) => {
    const {
      current_cash,
      current_burn,
      decision_cost,
      is_recurring,
      recurring_frequency_months = 1
    } = input;

    let new_cash = current_cash;
    let new_burn = current_burn;

    if (is_recurring) {
      // Add to monthly burn
      const monthly_addition = decision_cost / recurring_frequency_months;
      new_burn = current_burn + monthly_addition;
    } else {
      // One-time cost
      new_cash = current_cash - decision_cost;
    }

    const current_runway = current_burn > 0 ? current_cash / current_burn : 999;
    const new_runway = new_burn > 0 ? new_cash / new_burn : 999;
    const runway_reduction = current_runway - new_runway;
    const percentage_change = current_runway > 0
      ? (runway_reduction / current_runway) * 100
      : 0;

    const today = new Date();
    const zero_cash_date = new Date(today);
    zero_cash_date.setMonth(zero_cash_date.getMonth() + Math.floor(current_runway));

    const zero_cash_date_with_decision = new Date(today);
    zero_cash_date_with_decision.setMonth(zero_cash_date_with_decision.getMonth() + Math.floor(new_runway));

    // Risk assessment
    let risk_level: 'low' | 'medium' | 'high' | 'critical';
    if (new_runway < 3) {
      risk_level = 'critical';
    } else if (new_runway < 6) {
      risk_level = 'high';
    } else if (runway_reduction > current_runway * 0.3) {
      risk_level = 'high';
    } else if (runway_reduction > current_runway * 0.15) {
      risk_level = 'medium';
    } else {
      risk_level = 'low';
    }

    return {
      current_runway_months: current_runway,
      new_runway_months: new_runway,
      runway_reduction_months: runway_reduction,
      percentage_change,
      zero_cash_date: zero_cash_date.toISOString().split('T')[0],
      zero_cash_date_with_decision: zero_cash_date_with_decision.toISOString().split('T')[0],
      risk_level,
      new_monthly_burn: new_burn,
      burn_increase: new_burn - current_burn
    };
  }
};

const findAlternativeOptions: AgentTool = {
  name: 'find_alternative_options',
  description: 'Generate alternative options for a decision',
  input_schema: {
    type: 'object',
    properties: {
      decision_type: {
        type: 'string',
        description: 'Type of decision (hire, tool_purchase, etc.)'
      },
      original_cost: {
        type: 'number',
        description: 'Original cost estimate'
      },
      context: {
        type: 'object',
        description: 'Additional context'
      }
    },
    required: ['decision_type', 'original_cost']
  },
  execute: async (input: any) => {
    const { decision_type, original_cost, context = {} } = input;

    const alternatives: any[] = [];

    if (decision_type === 'hire') {
      alternatives.push({
        option: 'Hire contractor instead of full-time',
        cost_reduction: original_cost * 0.4,
        new_cost: original_cost * 0.6,
        pros: ['Lower commitment', 'Faster to onboard', 'No benefits overhead'],
        cons: ['Less availability', 'May leave project mid-way', 'Less cultural alignment']
      });

      alternatives.push({
        option: 'Hire junior + upskill',
        cost_reduction: original_cost * 0.5,
        new_cost: original_cost * 0.5,
        pros: ['Much lower cost', 'Can mold to company culture', 'Long-term investment'],
        cons: ['Slower productivity', 'Requires mentoring time', 'Learning curve']
      });

      alternatives.push({
        option: 'Defer hiring 3 months',
        cost_reduction: (original_cost / 12) * 3,
        new_cost: original_cost,
        pros: ['Extends runway', 'More time to validate need', 'Can wait for funding'],
        cons: ['Delayed progress', 'Team may be overworked', 'May lose good candidates']
      });
    } else if (decision_type === 'tool_purchase') {
      alternatives.push({
        option: 'Use free/open-source alternative',
        cost_reduction: original_cost,
        new_cost: 0,
        pros: ['Zero cost', 'No vendor lock-in', 'Community support'],
        cons: ['May lack features', 'More setup time', 'Less support']
      });

      alternatives.push({
        option: 'Start with basic plan, upgrade later',
        cost_reduction: original_cost * 0.5,
        new_cost: original_cost * 0.5,
        pros: ['Lower initial cost', 'Can test before committing', 'Easy to upgrade'],
        cons: ['May hit limits quickly', 'Features limited', 'Multiple upgrades costly']
      });
    }

    return {
      alternatives,
      count: alternatives.length
    };
  }
};

const SYSTEM_PROMPT = `You are a financial decision advisor for startups and businesses.

Your job is to analyze financial decisions and provide impact analysis with recommendations.

Use the provided tools to:
1. Get current burn rate and runway (get_entity_burn_rate)
2. Simulate the decision's impact (simulate_decision_impact)
3. Generate alternative options (find_alternative_options)

RISK LEVELS:
- Critical: New runway < 3 months
- High: New runway < 6 months OR reduction > 30%
- Medium: Reduction > 15%
- Low: Manageable impact

RECOMMENDATION LOGIC:
- Critical risk → REJECT
- High risk → DEFER or find alternatives
- Medium risk → PROCEED WITH CAUTION
- Low risk → PROCEED

Be conservative. Startups die from running out of cash.

Output JSON format:
{
  "runway_impact": {...},
  "burn_rate_impact": {...},
  "risk_assessment": {
    "risk_level": "low|medium|high|critical",
    "risk_factors": [...],
    "mitigation_suggestions": [...]
  },
  "alternatives": [...],
  "recommendation": {
    "verdict": "proceed|proceed_with_caution|defer|reject",
    "reasoning": "...",
    "conditions": [...]
  }
}`;

export class PreDecisionAgent extends BaseAgent {
  constructor() {
    super(
      'pre_decision',
      'Analyzes financial impact of business decisions',
      [getEntityBurnRate, simulateDecisionImpact, findAlternativeOptions]
    );
  }

  async execute(input: PreDecisionInput, context: AgentContext): Promise<PreDecisionOutput> {
    const startTime = Date.now();

    try {
      const userPrompt = this.buildPrompt(input);

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        5
      );

      // Parse JSON response
      let analysis: any;
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        analysis = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        throw new Error('Failed to parse analysis');
      }

      const output: PreDecisionOutput = {
        analysis,
        metadata: {
          generated_at: new Date().toISOString(),
          assumptions: [
            'Current burn rate continues at same pace',
            'No additional revenue unless specified',
            'No other major expenses',
            'Cost estimates are accurate'
          ],
          confidence: 0.8
        }
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
      if (analysis.risk_assessment.risk_level === 'critical' || analysis.risk_assessment.risk_level === 'high') {
        this.emitEvent({
          type: 'pre_decision.high_risk_detected',
          data: {
            entity_id: input.entity_id,
            decision_type: input.decision.type,
            risk_level: analysis.risk_assessment.risk_level,
            recommendation: analysis.recommendation.verdict
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

  private buildPrompt(input: PreDecisionInput): string {
    const parts: string[] = [];

    parts.push('Analyze this business decision:');
    parts.push(`\nEntity ID: ${input.entity_id}`);
    parts.push(`Decision Type: ${input.decision.type}`);
    parts.push(`Description: ${input.decision.description}`);
    parts.push(`Estimated Cost: ₹${input.decision.estimated_cost.toLocaleString('en-IN')}`);
    parts.push(`Recurring: ${input.decision.is_recurring ? 'Yes' : 'No'}`);

    if (input.decision.is_recurring && input.decision.recurring_frequency) {
      parts.push(`Frequency: ${input.decision.recurring_frequency}`);
    }

    if (input.context) {
      parts.push('\nAdditional Context:');
      if (input.context.current_team_size) {
        parts.push(`- Team size: ${input.context.current_team_size}`);
      }
      if (input.context.current_revenue) {
        parts.push(`- Monthly revenue: ₹${input.context.current_revenue.toLocaleString('en-IN')}`);
      }
      if (input.context.fundraise_planned) {
        parts.push('- Fundraise planned');
      }
    }

    parts.push('\nUse tools to:');
    parts.push('1. Get current financials');
    parts.push('2. Simulate impact');
    parts.push('3. Generate alternatives');
    parts.push('\nThen provide comprehensive analysis in JSON format.');

    return parts.join('\n');
  }
}

// Export singleton instance
export const preDecisionAgent = new PreDecisionAgent();
