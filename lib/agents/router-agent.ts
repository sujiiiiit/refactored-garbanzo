/**
 * Router Agent
 * Orchestrates multi-modal input routing to appropriate specialized agents
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';

interface RouterInput {
  input_type?: 'auto' | 'voice' | 'image' | 'text' | 'sms';
  input_data: {
    text?: string;
    audio_url?: string;
    image_url?: string;
    sms_text?: string;
    metadata?: Record<string, any>;
  };
  user_id: string;
  entity_id?: string;
  group_id?: string;
}

interface RouterOutput {
  detected_intent: 'add_expense' | 'query_expenses' | 'create_group' | 'split_expense' | 'get_insights' | 'unknown';
  routed_to: string; // Agent name or endpoint
  confidence: number;
  extracted_params: Record<string, any>;
  next_steps: string[];
  reasoning: string;
}

const detectIntent: AgentTool = {
  name: 'detect_intent',
  description: 'Analyze input and determine user intent',
  input_schema: {
    type: 'object',
    properties: {
      input_text: {
        type: 'string',
        description: 'Text input to analyze'
      },
      input_type: {
        type: 'string',
        description: 'Type of input (voice, image, text, sms)'
      }
    },
    required: ['input_text']
  },
  execute: async (input: any) => {
    const text = input.input_text.toLowerCase();

    // Expense-related keywords
    const expenseKeywords = ['spent', 'paid', 'bought', 'expense', 'cost', 'rupees', 'rs', 'inr', '₹'];
    const hasExpenseKeyword = expenseKeywords.some(kw => text.includes(kw));

    // Query keywords
    const queryKeywords = ['how much', 'total', 'show me', 'list', 'what did i', 'my expenses'];
    const hasQueryKeyword = queryKeywords.some(kw => text.includes(kw));

    // Group/split keywords
    const splitKeywords = ['split', 'share', 'divide', 'group expense'];
    const hasSplitKeyword = splitKeywords.some(kw => text.includes(kw));

    // Insights keywords
    const insightKeywords = ['suggest', 'recommend', 'insight', 'analyze', 'optimize'];
    const hasInsightKeyword = insightKeywords.some(kw => text.includes(kw));

    // Determine intent
    let intent = 'unknown';
    let confidence = 0.5;

    if (input.input_type === 'image') {
      intent = 'add_expense';
      confidence = 0.9;
    } else if (hasExpenseKeyword && !hasQueryKeyword) {
      intent = 'add_expense';
      confidence = 0.85;
    } else if (hasSplitKeyword) {
      intent = 'split_expense';
      confidence = 0.8;
    } else if (hasQueryKeyword) {
      intent = 'query_expenses';
      confidence = 0.75;
    } else if (hasInsightKeyword) {
      intent = 'get_insights';
      confidence = 0.7;
    }

    // Extract amount if present
    const amountMatch = text.match(/(?:rs\.?|rupees|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

    return {
      intent,
      confidence,
      extracted_amount: amount,
      has_expense_keyword: hasExpenseKeyword,
      has_query_keyword: hasQueryKeyword,
      has_split_keyword: hasSplitKeyword
    };
  }
};

const extractEntities: AgentTool = {
  name: 'extract_entities',
  description: 'Extract key entities from input (merchant, amount, date, category)',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Input text'
      }
    },
    required: ['text']
  },
  execute: async (input: any) => {
    const text = input.text;

    // Extract amount
    const amountPatterns = [
      /(?:rs\.?|rupees|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
      /(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:rs\.?|rupees|inr|₹)/i
    ];

    let amount = null;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Extract date references
    const dateKeywords = {
      today: 0,
      yesterday: -1,
      'day before': -2,
      'last week': -7,
      'last month': -30
    };

    let daysOffset = 0;
    for (const [keyword, offset] of Object.entries(dateKeywords)) {
      if (text.toLowerCase().includes(keyword)) {
        daysOffset = offset;
        break;
      }
    }

    const date = new Date();
    date.setDate(date.getDate() + daysOffset);

    // Extract merchant name (simplified - look for capitalized words after "at", "from", "to")
    const merchantMatch = text.match(/(?:at|from|to|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    const merchant = merchantMatch ? merchantMatch[1] : null;

    // Extract category hints
    const categoryHints: Record<string, string[]> = {
      'Food & Dining': ['food', 'restaurant', 'lunch', 'dinner', 'breakfast', 'cafe', 'swiggy', 'zomato'],
      'Transportation': ['uber', 'ola', 'taxi', 'metro', 'bus', 'fuel', 'petrol'],
      'Shopping': ['shopping', 'amazon', 'flipkart', 'bought', 'purchased'],
      'Entertainment': ['movie', 'netflix', 'spotify', 'concert', 'show'],
      'Utilities': ['electricity', 'water', 'internet', 'mobile', 'recharge']
    };

    let suggestedCategory = null;
    for (const [category, keywords] of Object.entries(categoryHints)) {
      if (keywords.some(kw => text.toLowerCase().includes(kw))) {
        suggestedCategory = category;
        break;
      }
    }

    return {
      amount,
      date: date.toISOString().split('T')[0],
      merchant_name: merchant,
      suggested_category: suggestedCategory,
      raw_text: text
    };
  }
};

const routeToAgent: AgentTool = {
  name: 'route_to_agent',
  description: 'Determine which agent or endpoint should handle the request',
  input_schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'Detected user intent'
      },
      input_type: {
        type: 'string',
        description: 'Type of input'
      }
    },
    required: ['intent', 'input_type']
  },
  execute: async (input: any) => {
    const routes: Record<string, any> = {
      add_expense: {
        voice: 'voice-agent',
        image: 'ocr-agent',
        text: 'auto-classifier-agent',
        sms: 'sms-parser'
      },
      query_expenses: {
        default: 'api/expenses'
      },
      split_expense: {
        default: 'split-settlement-agent'
      },
      get_insights: {
        default: 'insights-agent'
      },
      unknown: {
        default: 'manual-review'
      }
    };

    const intentRoutes = routes[input.intent] || routes.unknown;
    const agent = intentRoutes[input.input_type] || intentRoutes.default;

    return {
      agent,
      endpoint: `/api/${agent}`,
      requires_user_confirmation: input.intent === 'unknown'
    };
  }
};

const SYSTEM_PROMPT = `You are an intelligent routing agent for an expense tracking system.

Your job is to:
1. Detect user intent from multi-modal input (voice, image, text, SMS)
2. Extract relevant entities (amount, merchant, date, category)
3. Route the request to the appropriate specialized agent

INTENTS:
- add_expense: User wants to record an expense
- query_expenses: User wants to see/search expenses
- split_expense: User wants to split an expense with others
- get_insights: User wants spending insights or recommendations
- unknown: Cannot determine intent

ROUTING LOGIC:
- Voice input → voice-agent (Deepgram STT)
- Image input → ocr-agent (Google Vision)
- SMS input → sms-parser (bank SMS templates)
- Text input with expense keywords → auto-classifier-agent
- Query requests → api/expenses
- Split requests → split-settlement-agent
- Insights requests → insights-agent

Output JSON:
{
  "detected_intent": "add_expense" | "query_expenses" | "split_expense" | "get_insights" | "unknown",
  "routed_to": "agent-name",
  "confidence": 0.0-1.0,
  "extracted_params": {
    "amount": number | null,
    "merchant_name": string | null,
    "date": "YYYY-MM-DD",
    "category": string | null
  },
  "next_steps": ["step 1", "step 2"],
  "reasoning": "Why this routing decision was made"
}`;

export class RouterAgent extends BaseAgent {
  constructor() {
    super(
      'router',
      'Orchestrates multi-modal input routing to specialized agents',
      [detectIntent, extractEntities, routeToAgent]
    );
  }

  async execute(input: RouterInput, context: AgentContext): Promise<RouterOutput> {
    const startTime = Date.now();

    try {
      // Determine actual input type if auto
      let inputType = input.input_type || 'auto';
      if (inputType === 'auto') {
        if (input.input_data.audio_url) inputType = 'voice';
        else if (input.input_data.image_url) inputType = 'image';
        else if (input.input_data.sms_text) inputType = 'sms';
        else inputType = 'text';
      }

      // Get input text
      const inputText = input.input_data.text ||
                        input.input_data.sms_text ||
                        'Image or voice input';

      const userPrompt = this.buildPrompt(input, inputType, inputText);

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        3
      );

      // Parse JSON response
      let routerOutput: RouterOutput;
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found');
        routerOutput = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // Fallback routing based on input type
        routerOutput = {
          detected_intent: 'add_expense',
          routed_to: inputType === 'voice' ? 'voice-agent' :
                     inputType === 'image' ? 'ocr-agent' : 'auto-classifier-agent',
          confidence: 0.5,
          extracted_params: {},
          next_steps: ['Process input with specialized agent'],
          reasoning: 'Fallback routing based on input type'
        };
      }

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(
        context,
        input,
        routerOutput,
        'success',
        undefined,
        executionTime,
        result.usage.input_tokens + result.usage.output_tokens
      );

      // Emit event
      this.emitEvent({
        type: 'routing.completed',
        data: {
          intent: routerOutput.detected_intent,
          routed_to: routerOutput.routed_to,
          confidence: routerOutput.confidence
        },
        timestamp: new Date().toISOString(),
        context
      });

      return routerOutput;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      await this.logExecution(context, input, null, 'failure', error.message, executionTime);
      throw error;
    }
  }

  private buildPrompt(input: RouterInput, inputType: string, inputText: string): string {
    const parts: string[] = [];

    parts.push('Route this user input:');
    parts.push(`\nInput Type: ${inputType}`);
    parts.push(`\nInput Text: "${inputText}"`);

    if (input.entity_id) {
      parts.push(`\nEntity ID: ${input.entity_id} (business context)`);
    }

    if (input.group_id) {
      parts.push(`\nGroup ID: ${input.group_id} (group expense context)`);
    }

    if (input.input_data.metadata) {
      parts.push(`\nMetadata: ${JSON.stringify(input.input_data.metadata)}`);
    }

    parts.push('\nUse tools to:');
    parts.push('1. Detect user intent');
    parts.push('2. Extract entities (amount, merchant, date, category)');
    parts.push('3. Route to appropriate agent');
    parts.push('\nReturn routing decision in JSON format.');

    return parts.join('\n');
  }
}

// Export singleton instance
export const routerAgent = new RouterAgent();
