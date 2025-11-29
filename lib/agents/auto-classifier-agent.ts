/**
 * Auto Classifier Agent
 * Automatically categorizes expenses using LLM + rules + historical patterns
 */

import { BaseAgent, AgentContext } from './core/base-agent';
import { databaseTools } from './tools/database-tools';

interface ClassificationInput {
  transaction_id?: string;
  description: string;
  merchant_name?: string;
  amount?: number;
  user_id: string;
  entity_id?: string;
}

interface ClassificationOutput {
  category: string;
  subcategory: string | null;
  confidence: number;
  reasoning: string;
  is_business_expense: boolean;
  gst_applicable: boolean;
  gst_rate: number | null;
  gl_code?: string;
  hsn_sac_code?: string;
}

const SYSTEM_PROMPT = `You are an expense categorization expert for Indian users and businesses.

Your job is to categorize transactions into the correct expense category with high accuracy.

IMPORTANT RULES:
1. Always use the provided tools to:
   - Check if merchant exists in database (get_merchant_category_mapping)
   - Check user's historical categorizations (fetch_user_categorization_history)
   - Get valid category list (get_category_list)
   - Apply GST rules for the category (apply_gst_rules)

2. Categorization priority:
   - Exact merchant match from database: 0.95 confidence
   - User's historical pattern match: 0.90 confidence
   - Keyword/description match: 0.75 confidence
   - LLM inference only: 0.70 confidence

3. For business expense detection:
   - High amounts (>₹50,000) likely business
   - B2B merchants (AWS, Salesforce, etc.) → business
   - SaaS tools, cloud services → business
   - Personal items (groceries from local store) → individual

4. GST rules (India):
   - Healthcare, Education: 0% GST
   - Restaurants, Transport: 5% GST
   - Most goods/services: 18% GST
   - Use apply_gst_rules tool for accurate rates

5. Indian merchant patterns:
   - Swiggy, Zomato → Food & Dining / Restaurants
   - Uber, Ola → Transportation / Cab
   - Amazon, Flipkart → Shopping
   - Cafe Coffee Day, Starbucks → Food & Dining / Cafe
   - PVR, BookMyShow → Entertainment / Movies
   - DMart, BigBasket → Food & Dining / Groceries

Output format (strict JSON):
{
  "category": "<exact category name>",
  "subcategory": "<subcategory or null>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation of why this category>",
  "is_business_expense": <boolean>,
  "gst_applicable": <boolean>,
  "gst_rate": <number or null>,
  "gl_code": "<GL code or null>",
  "hsn_sac_code": "<HSN/SAC code or null>"
}`;

export class AutoClassifierAgent extends BaseAgent {
  constructor() {
    super(
      'auto_classifier',
      'Automatically categorizes transactions using ML and historical patterns',
      databaseTools
    );
  }

  async execute(input: ClassificationInput, context: AgentContext): Promise<ClassificationOutput> {
    const startTime = Date.now();

    try {
      const userPrompt = this.buildUserPrompt(input);

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        5 // max iterations for tool calls
      );

      // Parse JSON response
      let classification: ClassificationOutput;
      try {
        // Extract JSON from response
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        classification = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // Fallback to basic categorization
        classification = {
          category: 'Other',
          subcategory: null,
          confidence: 0.5,
          reasoning: 'Failed to parse LLM response',
          is_business_expense: false,
          gst_applicable: true,
          gst_rate: 18.0
        };
      }

      // Validate confidence is within range
      classification.confidence = Math.max(0, Math.min(1, classification.confidence));

      // Log execution
      const executionTime = Date.now() - startTime;
      await this.logExecution(
        context,
        input,
        classification,
        'success',
        undefined,
        executionTime,
        result.usage.input_tokens + result.usage.output_tokens
      );

      // Emit event
      this.emitEvent({
        type: 'transaction.classified',
        data: {
          transaction_id: input.transaction_id,
          category: classification.category,
          confidence: classification.confidence
        },
        timestamp: new Date().toISOString(),
        context
      });

      return classification;

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

      // Return fallback classification
      return {
        category: 'Other',
        subcategory: null,
        confidence: 0.3,
        reasoning: `Classification failed: ${error.message}`,
        is_business_expense: false,
        gst_applicable: true,
        gst_rate: 18.0
      };
    }
  }

  private buildUserPrompt(input: ClassificationInput): string {
    const parts: string[] = [];

    parts.push('Categorize this transaction:');
    parts.push(`\nDescription: ${input.description}`);

    if (input.merchant_name) {
      parts.push(`Merchant: ${input.merchant_name}`);
    }

    if (input.amount) {
      parts.push(`Amount: ₹${input.amount.toFixed(2)}`);
    }

    parts.push(`\nUser ID: ${input.user_id}`);

    if (input.entity_id) {
      parts.push(`Entity ID: ${input.entity_id} (business transaction)`);
    }

    parts.push('\nUse the provided tools in this order:');
    parts.push('1. get_merchant_category_mapping - check if merchant is known');
    parts.push('2. fetch_user_categorization_history - check user\'s past patterns');
    parts.push('3. get_category_list - get valid categories');
    parts.push('4. apply_gst_rules - get GST info for chosen category');
    parts.push('\nThen provide your classification in the required JSON format.');

    return parts.join('\n');
  }

  /**
   * Batch classify multiple transactions
   */
  async classifyBatch(
    transactions: ClassificationInput[],
    context: AgentContext
  ): Promise<ClassificationOutput[]> {
    const results = await Promise.all(
      transactions.map(t => this.execute(t, context))
    );

    return results;
  }

  /**
   * Re-classify a transaction (e.g., after user correction)
   */
  async reclassify(
    transactionId: string,
    newCategory: string,
    userId: string,
    context: AgentContext
  ): Promise<void> {
    // Log user correction for future learning
    this.emitEvent({
      type: 'classification.user_override',
      data: {
        transaction_id: transactionId,
        new_category: newCategory,
        user_id: userId
      },
      timestamp: new Date().toISOString(),
      context
    });

    // In the future, this could update the merchant mapping
    // or retrain the classification model
  }
}

// Export singleton instance
export const autoClassifierAgent = new AutoClassifierAgent();
