/**
 * Centralized Anthropic Claude Client
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  return client;
}

export const MODELS = {
  SONNET: 'claude-3-5-sonnet-20241022',
  HAIKU: 'claude-3-5-haiku-20241022',
  OPUS: 'claude-3-opus-20240229',
} as const;

export const MODEL_COSTS = {
  [MODELS.SONNET]: { input: 0.003, output: 0.015 }, // per million tokens
  [MODELS.HAIKU]: { input: 0.001, output: 0.005 },
  [MODELS.OPUS]: { input: 0.015, output: 0.075 },
} as const;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) return 0;

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return inputCost + outputCost;
}
