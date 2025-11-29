/**
 * Voice Agent
 * Transcribes voice input and extracts expense details using Deepgram STT
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

interface VoiceInput {
  audio_url: string;
  audio_format: string;
  language?: string;
  duration_seconds?: number;
  user_id: string;
  group_id?: string;
}

interface VoiceOutput {
  transcription: {
    text: string;
    confidence: number;
    language_detected: string;
    alternative_transcriptions?: string[];
  };
  extracted_expense: {
    amount: number | null;
    currency: string;
    description: string | null;
    merchant_name?: string;
    category?: string;
    date?: string;
    confidence: number;
  };
  intent: 'add_expense' | 'query' | 'split' | 'other';
  needs_clarification?: string[];
}

const parseNaturalLanguage: AgentTool = {
  name: 'parse_natural_language',
  description: 'Extract expense fields from natural language transcription',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Transcribed text from voice input'
      },
      user_currency: {
        type: 'string',
        description: 'User\'s default currency (e.g., INR, USD)'
      }
    },
    required: ['text']
  },
  execute: async (input: any) => {
    const { text, user_currency = 'INR' } = input;

    // Extract amount
    const amountPatterns = [
      /(?:spent|paid|cost|costs|₹|rs\.?\s*|rupees?\s+)(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rupees?|bucks|dollars?)/i,
      /(?:fifty|hundred|thousand)\s*rupees?/i
    ];

    let amount: number | null = null;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Handle word numbers (fifty, hundred, etc.)
    const wordNumbers: Record<string, number> = {
      fifty: 50, hundred: 100, thousand: 1000,
      two: 2, three: 3, four: 4, five: 5,
      ten: 10, twenty: 20, thirty: 30, forty: 40
    };

    if (!amount) {
      for (const [word, value] of Object.entries(wordNumbers)) {
        if (text.toLowerCase().includes(word)) {
          amount = value;
          break;
        }
      }
    }

    // Extract merchant/description
    const merchantPatterns = [
      /(?:at|from|to)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:for|on|yesterday|today)|\.|$)/,
      /(?:bought|ordered|got)\s+(.+?)\s+(?:at|from)/i
    ];

    let merchant: string | null = null;
    for (const pattern of merchantPatterns) {
      const match = text.match(pattern);
      if (match) {
        merchant = match[1].trim();
        break;
      }
    }

    // Extract date references
    const today = new Date();
    let date: string | null = null;

    if (/yesterday/i.test(text)) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().split('T')[0];
    } else if (/today/i.test(text)) {
      date = today.toISOString().split('T')[0];
    } else if (/last\s+night/i.test(text)) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().split('T')[0];
    }

    return {
      amount,
      merchant,
      date,
      currency: user_currency,
      confidence: amount ? 0.85 : 0.5
    };
  }
};

const resolveDateReference: AgentTool = {
  name: 'resolve_date_reference',
  description: 'Convert relative date references to absolute dates',
  input_schema: {
    type: 'object',
    properties: {
      reference: {
        type: 'string',
        description: 'Date reference like "yesterday", "last Monday", "3 days ago"'
      }
    },
    required: ['reference']
  },
  execute: async (input: any) => {
    const { reference } = input;
    const today = new Date();
    let date = new Date(today);

    const ref = reference.toLowerCase();

    if (ref.includes('yesterday')) {
      date.setDate(date.getDate() - 1);
    } else if (ref.includes('today')) {
      // Keep today's date
    } else if (ref.includes('last night')) {
      date.setDate(date.getDate() - 1);
    } else if (ref.match(/(\d+)\s*days?\s*ago/)) {
      const days = parseInt(ref.match(/(\d+)/)?.[1] || '1');
      date.setDate(date.getDate() - days);
    } else if (ref.includes('last week')) {
      date.setDate(date.getDate() - 7);
    }

    return {
      date: date.toISOString().split('T')[0],
      timestamp: date.toISOString()
    };
  }
};

const SYSTEM_PROMPT = `You are a voice expense parser for an Indian expense tracking app.

Your job is to extract expense details from natural language voice transcriptions.

Common patterns:
- "I spent fifty rupees on chai at CCD" → amount: 50, description: "Chai", merchant: "CCD"
- "Paid two hundred for Uber last night" → amount: 200, merchant: "Uber", date: yesterday
- "Bought groceries for twelve hundred at DMart" → amount: 1200, description: "Groceries", merchant: "DMart"

EXTRACTION RULES:
1. Convert word numbers to digits ("fifty" → 50, "hundred" → 100)
2. Infer currency from context (default INR for Indian users)
3. Resolve relative dates to absolute (use resolve_date_reference tool)
4. Match merchants to known names (Swiggy, Zomato, Uber, CCD, etc.)
5. Extract description from context

Use the parse_natural_language tool to extract basic fields, then refine.

Output JSON:
{
  "amount": number | null,
  "currency": "INR" | "USD" | ...,
  "description": string | null,
  "merchant_name": string | null,
  "category": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "confidence": 0.0-1.0
}`;

export class VoiceAgent extends BaseAgent {
  private deepgramClient: any = null;

  constructor() {
    super(
      'voice_agent',
      'Transcribes voice input and extracts expense details',
      [parseNaturalLanguage, resolveDateReference]
    );

    if (process.env.DEEPGRAM_API_KEY) {
      this.deepgramClient = createDeepgramClient(process.env.DEEPGRAM_API_KEY);
    }
  }

  async execute(input: VoiceInput, context: AgentContext): Promise<VoiceOutput> {
    const startTime = Date.now();

    try {
      // Perform speech-to-text
      const transcription = await this.transcribeAudio(input);

      // Parse transcription with LLM
      const userPrompt = `User said: "${transcription.text}"\n\nExtract expense details in JSON format.`;

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        3
      );

      // Parse JSON response
      let extractedExpense: any;
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');
        extractedExpense = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        extractedExpense = {
          amount: null,
          currency: 'INR',
          description: transcription.text,
          confidence: 0.3
        };
      }

      // Determine intent
      let intent: VoiceOutput['intent'] = 'add_expense';
      const lowerText = transcription.text.toLowerCase();

      if (lowerText.includes('how much') || lowerText.includes('show me')) {
        intent = 'query';
      } else if (lowerText.includes('split')) {
        intent = 'split';
      } else if (!extractedExpense.amount) {
        intent = 'other';
      }

      const output: VoiceOutput = {
        transcription: {
          text: transcription.text,
          confidence: transcription.confidence,
          language_detected: input.language || 'en-IN',
          alternative_transcriptions: transcription.alternatives
        },
        extracted_expense: {
          amount: extractedExpense.amount,
          currency: extractedExpense.currency || 'INR',
          description: extractedExpense.description,
          merchant_name: extractedExpense.merchant_name,
          category: extractedExpense.category,
          date: extractedExpense.date,
          confidence: extractedExpense.confidence || 0.7
        },
        intent,
        needs_clarification: []
      };

      // Check if clarification needed
      if (!output.extracted_expense.amount) {
        output.needs_clarification?.push('amount');
      }

      if (output.extracted_expense.confidence < 0.7) {
        output.needs_clarification?.push('review_all_fields');
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
        type: 'voice.transcribed',
        data: {
          text: transcription.text,
          confidence: transcription.confidence,
          intent: output.intent
        },
        timestamp: new Date().toISOString(),
        context
      });

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

  private async transcribeAudio(input: VoiceInput): Promise<{
    text: string;
    confidence: number;
    alternatives?: string[];
  }> {
    if (!this.deepgramClient) {
      throw new Error('Deepgram client not initialized. Please set DEEPGRAM_API_KEY.');
    }

    try {
      // Fetch audio file
      const response = await fetch(input.audio_url);
      const audioBuffer = await response.arrayBuffer();

      // Transcribe with Deepgram
      const { result } = await this.deepgramClient.listen.prerecorded.transcribeFile(
        Buffer.from(audioBuffer),
        {
          model: 'nova-2',
          language: input.language || 'en-IN', // Indian English
          smart_format: true,
          punctuate: true,
          diarize: false
        }
      );

      const transcript = result.results?.channels?.[0]?.alternatives?.[0];

      if (!transcript) {
        throw new Error('No transcription result');
      }

      const alternatives = result.results?.channels?.[0]?.alternatives
        ?.slice(1, 3)
        .map((alt: any) => alt.transcript);

      return {
        text: transcript.transcript,
        confidence: transcript.confidence || 0.8,
        alternatives
      };

    } catch (error: any) {
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export const voiceAgent = new VoiceAgent();
