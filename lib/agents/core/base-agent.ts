/**
 * Base Agent Framework
 * Foundation for all AI agents in the system
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { createClient } from '@/lib/supabase/server';

export interface AgentContext {
  user_id?: string;
  entity_id?: string;
  session_id: string;
  request_id: string;
  metadata: Record<string, any>;
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (input: any, context: AgentContext) => Promise<any>;
}

export interface AgentEvent {
  type: string;
  data: any;
  timestamp: string;
  agent_name: string;
  context: AgentContext;
}

export interface LLMResponse {
  content: any[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export abstract class BaseAgent {
  protected name: string;
  protected description: string;
  protected tools: AgentTool[];
  protected llmClient: Anthropic;
  protected eventEmitter: EventEmitter;
  protected model: string = 'claude-3-5-sonnet-20241022';

  constructor(name: string, description: string, tools: AgentTool[] = []) {
    this.name = name;
    this.description = description;
    this.tools = tools;
    this.llmClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Main execution method - must be implemented by each agent
   */
  abstract execute(input: any, context: AgentContext): Promise<any>;

  /**
   * Call LLM with tools
   */
  protected async callLLM(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext,
    maxIterations: number = 5
  ): Promise<any> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userPrompt }
    ];

    let iteration = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (iteration < maxIterations) {
      const response = await this.llmClient.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: this.tools.length > 0 ? this.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema
        })) : undefined,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Check if we need to execute tools
      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        // No more tool calls, extract final response
        const textContent = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        return {
          response: textContent?.text || '',
          raw: response.content,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens
          }
        };
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        try {
          const tool = this.tools.find(t => t.name === toolUse.name);
          if (!tool) {
            throw new Error(`Tool ${toolUse.name} not found`);
          }

          const result = await tool.execute(toolUse.input, context);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        } catch (error: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: error.message }),
            is_error: true
          });
        }
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });

      iteration++;
    }

    throw new Error(`Max iterations (${maxIterations}) reached`);
  }

  /**
   * Emit an event
   */
  protected emitEvent(event: Omit<AgentEvent, 'agent_name'>): void {
    const fullEvent: AgentEvent = {
      ...event,
      agent_name: this.name
    };
    this.eventEmitter.emit('agent_event', fullEvent);
  }

  /**
   * Log execution to database
   */
  protected async logExecution(
    context: AgentContext,
    input: any,
    output: any,
    status: 'success' | 'failure' | 'partial',
    error?: string,
    executionTime?: number,
    tokensUsed?: number
  ): Promise<void> {
    try {
      const supabase = await createClient();

      const costPerToken = 0.000003; // $3 per million tokens (Claude Sonnet)
      const cost = tokensUsed ? tokensUsed * costPerToken : 0;

      await supabase.from('agent_events').insert({
        agent_name: this.name,
        event_type: 'execution',
        user_id: context.user_id,
        entity_id: context.entity_id,
        input_data: input,
        output_data: output,
        tools_used: this.tools.map(t => t.name),
        execution_time_ms: executionTime,
        tokens_used: tokensUsed,
        cost_usd: cost,
        status,
        error_message: error
      });
    } catch (err) {
      console.error('Failed to log agent execution:', err);
    }
  }

  /**
   * Register event listener
   */
  public on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Get agent metadata
   */
  public getMetadata() {
    return {
      name: this.name,
      description: this.description,
      tools: this.tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    };
  }
}
