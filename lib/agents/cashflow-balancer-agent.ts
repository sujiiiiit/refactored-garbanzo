/**
 * Cashflow Balancer Agent
 * Optimizes cash allocation across multiple business entities
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface CashflowBalancerInput {
  user_id: string;
  entity_ids?: string[]; // If not provided, analyze all user's entities
  optimization_goal: 'maximize_runway' | 'minimize_risk' | 'balanced';
  constraints?: {
    min_cash_per_entity?: number;
    max_transfer_amount?: number;
    preserve_ratios?: boolean;
  };
}

interface CashflowBalancerOutput {
  current_state: {
    total_cash: number;
    total_monthly_burn: number;
    overall_runway: number;
    entities: Array<{
      entity_id: string;
      entity_name: string;
      cash_balance: number;
      monthly_burn: number;
      runway_months: number;
      status: 'critical' | 'warning' | 'healthy';
    }>;
  };
  optimization: {
    total_transfers_needed: number;
    total_amount_moved: number;
    transfers: Array<{
      from_entity_id: string;
      from_entity_name: string;
      to_entity_id: string;
      to_entity_name: string;
      amount: number;
      reason: string;
      impact: {
        from_runway_change: number;
        to_runway_change: number;
      };
    }>;
  };
  optimized_state: {
    total_cash: number;
    total_monthly_burn: number;
    overall_runway: number;
    min_runway_improved: boolean;
    entities: Array<{
      entity_id: string;
      entity_name: string;
      cash_balance: number;
      monthly_burn: number;
      runway_months: number;
      status: 'critical' | 'warning' | 'healthy';
    }>;
  };
  recommendations: string[];
  risk_assessment: {
    overall_risk: 'low' | 'medium' | 'high' | 'critical';
    critical_entities: number;
    runway_variance: number;
  };
}

const getEntityFinancials: AgentTool = {
  name: 'get_entity_financials',
  description: 'Fetch financial data for all user entities',
  input_schema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'User ID'
      },
      entity_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional specific entity IDs'
      }
    },
    required: ['user_id']
  },
  execute: async (input: any) => {
    const { user_id, entity_ids } = input;
    const supabase = await createClient();

    // Get entities user has access to
    let query = supabase
      .from('entity_members')
      .select(`
        entities (
          id,
          name,
          type,
          currency,
          cash_balance,
          monthly_burn_target,
          runway_months
        )
      `)
      .eq('user_id', user_id)
      .eq('role', 'admin'); // Only admins can optimize cashflow

    const { data: memberships } = await query;

    if (!memberships || memberships.length === 0) {
      return { entities: [] };
    }

    // Filter by entity_ids if provided
    let entities = memberships
      .map(m => m.entities)
      .filter(e => e !== null);

    if (entity_ids && entity_ids.length > 0) {
      entities = entities.filter(e => entity_ids.includes(e.id));
    }

    // Get actual burn rate for last 30 days
    const entityFinancials = await Promise.all(
      entities.map(async (entity) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('entity_id', entity.id)
          .gte('transaction_date', thirtyDaysAgo.toISOString().split('T')[0])
          .is('deleted_at', null);

        const actualBurn = transactions?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
        const cashBalance = Number(entity.cash_balance || 0);
        const runwayMonths = actualBurn > 0 ? cashBalance / actualBurn : 999;

        return {
          entity_id: entity.id,
          entity_name: entity.name,
          entity_type: entity.type,
          currency: entity.currency,
          cash_balance: cashBalance,
          monthly_burn: actualBurn,
          target_burn: Number(entity.monthly_burn_target || 0),
          target_runway: Number(entity.runway_months || 0),
          actual_runway: runwayMonths
        };
      })
    );

    return { entities: entityFinancials };
  }
};

const optimizeCashAllocation: AgentTool = {
  name: 'optimize_cash_allocation',
  description: 'Calculate optimal cash transfers between entities',
  input_schema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        description: 'Array of entity financial data'
      },
      goal: {
        type: 'string',
        enum: ['maximize_runway', 'minimize_risk', 'balanced'],
        description: 'Optimization goal'
      },
      min_cash_per_entity: {
        type: 'number',
        description: 'Minimum cash to maintain per entity'
      }
    },
    required: ['entities', 'goal']
  },
  execute: async (input: any) => {
    const { entities, goal, min_cash_per_entity = 50000 } = input;

    if (entities.length < 2) {
      return {
        transfers: [],
        message: 'Need at least 2 entities for optimization'
      };
    }

    // Sort entities by runway (ascending)
    const sortedEntities = [...entities].sort((a, b) => a.actual_runway - b.actual_runway);

    const transfers: Array<{
      from_entity_id: string;
      from_entity_name: string;
      to_entity_id: string;
      to_entity_name: string;
      amount: number;
      reason: string;
    }> = [];

    // Identify critical entities (runway < 3 months)
    const criticalEntities = sortedEntities.filter(e => e.actual_runway < 3);

    // Identify entities with excess runway (> 12 months)
    const excessEntities = sortedEntities.filter(e => e.actual_runway > 12);

    if (criticalEntities.length === 0) {
      return {
        transfers: [],
        message: 'No critical entities requiring immediate cash'
      };
    }

    // Optimization strategy based on goal
    if (goal === 'maximize_runway') {
      // Move cash from excess entities to critical ones
      for (const critical of criticalEntities) {
        const targetCash = critical.monthly_burn * 6; // 6 months runway
        const needed = Math.max(0, targetCash - critical.cash_balance);

        if (needed === 0) continue;

        for (const excess of excessEntities) {
          if (needed <= 0) break;

          const available = Math.max(0, excess.cash_balance - min_cash_per_entity);
          const maxTransfer = Math.min(available, excess.cash_balance - (excess.monthly_burn * 6));

          if (maxTransfer <= 0) continue;

          const transferAmount = Math.min(needed, maxTransfer);

          if (transferAmount > 10000) { // Only suggest transfers > ₹10k
            transfers.push({
              from_entity_id: excess.entity_id,
              from_entity_name: excess.entity_name,
              to_entity_id: critical.entity_id,
              to_entity_name: critical.entity_name,
              amount: Math.round(transferAmount),
              reason: `Critical: ${critical.entity_name} has only ${Math.round(critical.actual_runway * 10) / 10} months runway`
            });

            // Update balances for next iteration
            excess.cash_balance -= transferAmount;
            excess.actual_runway = excess.monthly_burn > 0 ? excess.cash_balance / excess.monthly_burn : 999;
            critical.cash_balance += transferAmount;
            critical.actual_runway = critical.monthly_burn > 0 ? critical.cash_balance / critical.monthly_burn : 999;
          }
        }
      }

    } else if (goal === 'minimize_risk') {
      // Equalize runway across all entities
      const totalCash = entities.reduce((sum, e) => sum + e.cash_balance, 0);
      const totalBurn = entities.reduce((sum, e) => sum + e.monthly_burn, 0);
      const targetRunway = totalBurn > 0 ? totalCash / totalBurn : 999;

      for (const entity of entities) {
        const targetCash = entity.monthly_burn * targetRunway;
        const diff = entity.cash_balance - targetCash;

        if (Math.abs(diff) > 10000) {
          if (diff > 0) {
            // Has excess, can give
            entity._excess = diff;
          } else {
            // Needs cash
            entity._deficit = Math.abs(diff);
          }
        }
      }

      const withExcess = entities.filter(e => e._excess > 0);
      const withDeficit = entities.filter(e => e._deficit > 0);

      for (const deficit of withDeficit) {
        let remaining = deficit._deficit;

        for (const excess of withExcess) {
          if (remaining <= 0) break;
          if (excess._excess <= 0) continue;

          const transferAmount = Math.min(remaining, excess._excess);

          transfers.push({
            from_entity_id: excess.entity_id,
            from_entity_name: excess.entity_name,
            to_entity_id: deficit.entity_id,
            to_entity_name: deficit.entity_name,
            amount: Math.round(transferAmount),
            reason: 'Risk balancing: equalize runway across entities'
          });

          excess._excess -= transferAmount;
          remaining -= transferAmount;
        }
      }

    } else { // balanced
      // Hybrid approach: prioritize critical, then balance
      const immediateTransfers = [];
      const balancingTransfers = [];

      // First pass: rescue critical entities
      for (const critical of criticalEntities) {
        const needed = critical.monthly_burn * 3 - critical.cash_balance;
        if (needed <= 0) continue;

        for (const excess of excessEntities) {
          const available = Math.max(0, excess.cash_balance - (excess.monthly_burn * 9));
          if (available <= 0) continue;

          const transferAmount = Math.min(needed, available);
          if (transferAmount > 10000) {
            immediateTransfers.push({
              from_entity_id: excess.entity_id,
              from_entity_name: excess.entity_name,
              to_entity_id: critical.entity_id,
              to_entity_name: critical.entity_name,
              amount: Math.round(transferAmount),
              reason: 'Immediate: Bring critical entity to 3 months runway'
            });
          }
        }
      }

      transfers.push(...immediateTransfers);
    }

    return {
      transfers,
      total_amount: transfers.reduce((sum, t) => sum + t.amount, 0)
    };
  }
};

const SYSTEM_PROMPT = `You are a cashflow optimization expert for multi-entity businesses.

Your job is to analyze cash positions across entities and recommend optimal transfers.

OPTIMIZATION GOALS:
- maximize_runway: Extend runway of critical entities
- minimize_risk: Equalize runway across all entities
- balanced: Rescue critical entities first, then balance

CONSTRAINTS:
- Never reduce any entity below minimum cash threshold
- Avoid transfers < ₹10,000 (administrative overhead)
- Preserve at least 6 months runway in source entities when possible

RISK LEVELS:
- Critical: Any entity with < 3 months runway
- High: Runway variance > 6 months across entities
- Medium: 2-4 entities with < 6 months runway
- Low: All entities > 6 months runway

Output detailed optimization plan with transfer recommendations.`;

export class CashflowBalancerAgent extends BaseAgent {
  constructor() {
    super(
      'cashflow_balancer',
      'Optimizes cash allocation across multiple business entities',
      [getEntityFinancials, optimizeCashAllocation]
    );
  }

  async execute(
    input: CashflowBalancerInput,
    context: AgentContext
  ): Promise<CashflowBalancerOutput> {
    const startTime = Date.now();

    try {
      // Get entity financials
      const financialsResult = await getEntityFinancials.execute({
        user_id: input.user_id,
        entity_ids: input.entity_ids
      }, context);

      const entities = financialsResult.entities;

      if (entities.length < 2) {
        throw new Error('Need at least 2 entities for cashflow optimization');
      }

      // Calculate current state
      const currentState = this.calculateState(entities);

      // Optimize cash allocation
      const optimizationResult = await optimizeCashAllocation.execute({
        entities: entities.map(e => ({ ...e })), // Clone
        goal: input.optimization_goal,
        min_cash_per_entity: input.constraints?.min_cash_per_entity || 50000
      }, context);

      // Simulate optimized state
      const optimizedEntities = this.applyTransfers(entities, optimizationResult.transfers);
      const optimizedState = this.calculateState(optimizedEntities);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        currentState,
        optimizedState,
        optimizationResult.transfers
      );

      // Risk assessment
      const riskAssessment = this.assessRisk(optimizedState);

      const output: CashflowBalancerOutput = {
        current_state: currentState,
        optimization: {
          total_transfers_needed: optimizationResult.transfers.length,
          total_amount_moved: optimizationResult.total_amount || 0,
          transfers: optimizationResult.transfers.map(t => ({
            ...t,
            impact: this.calculateTransferImpact(t, entities)
          }))
        },
        optimized_state: optimizedState,
        recommendations,
        risk_assessment: riskAssessment
      };

      // Store optimization in database
      const supabase = await createClient();
      await supabase.from('cashflow_optimizations').insert({
        user_id: input.user_id,
        optimization_goal: input.optimization_goal,
        current_state: currentState,
        suggested_transfers: optimizationResult.transfers,
        optimized_state: optimizedState,
        executed: false
      });

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, output, 'success', undefined, executionTime);

      // Emit event
      this.emitEvent({
        type: 'cashflow.optimized',
        data: {
          transfers_count: optimizationResult.transfers.length,
          total_amount: optimizationResult.total_amount
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

  private calculateState(entities: any[]): any {
    const totalCash = entities.reduce((sum, e) => sum + e.cash_balance, 0);
    const totalBurn = entities.reduce((sum, e) => sum + e.monthly_burn, 0);
    const overallRunway = totalBurn > 0 ? totalCash / totalBurn : 999;

    return {
      total_cash: Math.round(totalCash * 100) / 100,
      total_monthly_burn: Math.round(totalBurn * 100) / 100,
      overall_runway: Math.round(overallRunway * 10) / 10,
      entities: entities.map(e => ({
        entity_id: e.entity_id,
        entity_name: e.entity_name,
        cash_balance: Math.round(e.cash_balance * 100) / 100,
        monthly_burn: Math.round(e.monthly_burn * 100) / 100,
        runway_months: Math.round(e.actual_runway * 10) / 10,
        status: e.actual_runway < 3 ? 'critical' as const :
                e.actual_runway < 6 ? 'warning' as const : 'healthy' as const
      }))
    };
  }

  private applyTransfers(entities: any[], transfers: any[]): any[] {
    const updated = entities.map(e => ({ ...e }));

    transfers.forEach(transfer => {
      const from = updated.find(e => e.entity_id === transfer.from_entity_id);
      const to = updated.find(e => e.entity_id === transfer.to_entity_id);

      if (from && to) {
        from.cash_balance -= transfer.amount;
        from.actual_runway = from.monthly_burn > 0 ? from.cash_balance / from.monthly_burn : 999;

        to.cash_balance += transfer.amount;
        to.actual_runway = to.monthly_burn > 0 ? to.cash_balance / to.monthly_burn : 999;
      }
    });

    return updated;
  }

  private calculateTransferImpact(transfer: any, entities: any[]): any {
    const from = entities.find(e => e.entity_id === transfer.from_entity_id);
    const to = entities.find(e => e.entity_id === transfer.to_entity_id);

    if (!from || !to) return { from_runway_change: 0, to_runway_change: 0 };

    const fromNewCash = from.cash_balance - transfer.amount;
    const toNewCash = to.cash_balance + transfer.amount;

    const fromNewRunway = from.monthly_burn > 0 ? fromNewCash / from.monthly_burn : 999;
    const toNewRunway = to.monthly_burn > 0 ? toNewCash / to.monthly_burn : 999;

    return {
      from_runway_change: Math.round((fromNewRunway - from.actual_runway) * 10) / 10,
      to_runway_change: Math.round((toNewRunway - to.actual_runway) * 10) / 10
    };
  }

  private generateRecommendations(current: any, optimized: any, transfers: any[]): string[] {
    const recommendations: string[] = [];

    if (transfers.length === 0) {
      recommendations.push('✅ No cashflow optimization needed. All entities have healthy runway.');
      return recommendations;
    }

    const criticalBefore = current.entities.filter((e: any) => e.status === 'critical').length;
    const criticalAfter = optimized.entities.filter((e: any) => e.status === 'critical').length;

    if (criticalAfter < criticalBefore) {
      recommendations.push(`✅ Optimization rescues ${criticalBefore - criticalAfter} critical ${criticalBefore - criticalAfter === 1 ? 'entity' : 'entities'}`);
    }

    const totalMoved = transfers.reduce((sum, t) => sum + t.amount, 0);
    recommendations.push(`💰 Transfer ₹${totalMoved.toLocaleString()} across ${transfers.length} transactions`);

    if (optimized.overall_runway > current.overall_runway) {
      const improvement = optimized.overall_runway - current.overall_runway;
      recommendations.push(`📈 Overall runway improves by ${Math.round(improvement * 10) / 10} months`);
    }

    return recommendations;
  }

  private assessRisk(state: any): any {
    const criticalCount = state.entities.filter((e: any) => e.status === 'critical').length;
    const runways = state.entities.map((e: any) => e.runway_months);
    const variance = Math.max(...runways) - Math.min(...runways);

    const overallRisk = criticalCount > 0 ? 'critical' as const :
                        variance > 6 ? 'high' as const :
                        state.overall_runway < 6 ? 'medium' as const : 'low' as const;

    return {
      overall_risk: overallRisk,
      critical_entities: criticalCount,
      runway_variance: Math.round(variance * 10) / 10
    };
  }
}

// Export singleton instance
export const cashflowBalancerAgent = new CashflowBalancerAgent();
