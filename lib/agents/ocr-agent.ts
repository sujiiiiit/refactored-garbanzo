/**
 * OCR Agent
 * Extracts structured data from receipt/invoice images using Google Cloud Vision
 */

import { BaseAgent, AgentContext, AgentTool } from './core/base-agent';
import { createClient } from '@/lib/supabase/server';
import vision from '@google-cloud/vision';

interface OCRInput {
  receipt_id: string;
  image_url: string;
  file_type: string;
  user_id: string;
  entity_id?: string;
  expected_merchant?: string;
}

interface OCROutput {
  receipt_id: string;
  ocr_confidence: number;
  extracted_data: {
    merchant_name: string | null;
    merchant_address?: string;
    merchant_gstin?: string;
    transaction_date: string | null;
    transaction_time?: string;
    total_amount: number | null;
    currency: string;
    line_items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
      hsn_code?: string;
    }>;
    gst_details?: {
      cgst: number;
      sgst: number;
      igst: number;
      total_gst: number;
      gst_percentage: number;
    };
    payment_method?: string;
    payment_reference?: string;
  };
  quality_issues?: string[];
  suggestions?: string[];
}

const parseGSTFields: AgentTool = {
  name: 'parse_gst_fields',
  description: 'Extract GST details from OCR text for Indian invoices',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Raw OCR text containing GST information'
      }
    },
    required: ['text']
  },
  execute: async (input: any) => {
    const { text } = input;

    // Extract GSTIN (15 character alphanumeric)
    const gstinMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/);
    const gstin = gstinMatch ? gstinMatch[1] : null;

    // Extract GST amounts
    const cgstMatch = text.match(/CGST[:\s]+(?:Rs\.?\s*)?([0-9,]+\.?\d*)/i);
    const sgstMatch = text.match(/SGST[:\s]+(?:Rs\.?\s*)?([0-9,]+\.?\d*)/i);
    const igstMatch = text.match(/IGST[:\s]+(?:Rs\.?\s*)?([0-9,]+\.?\d*)/i);

    const cgst = cgstMatch ? parseFloat(cgstMatch[1].replace(/,/g, '')) : 0;
    const sgst = sgstMatch ? parseFloat(sgstMatch[1].replace(/,/g, '')) : 0;
    const igst = igstMatch ? parseFloat(igstMatch[1].replace(/,/g, '')) : 0;

    const total_gst = cgst + sgst + igst;

    return {
      gstin,
      cgst,
      sgst,
      igst,
      total_gst,
      found: total_gst > 0
    };
  }
};

const validateExtractedData: AgentTool = {
  name: 'validate_extracted_data',
  description: 'Validate consistency of extracted data',
  input_schema: {
    type: 'object',
    properties: {
      total_amount: {
        type: 'number',
        description: 'Total amount from receipt'
      },
      line_items_sum: {
        type: 'number',
        description: 'Sum of line item amounts'
      },
      gst_total: {
        type: 'number',
        description: 'Total GST amount'
      }
    },
    required: []
  },
  execute: async (input: any) => {
    const { total_amount, line_items_sum, gst_total } = input;
    const issues: string[] = [];

    // Check if line items sum matches total (within 1% tolerance)
    if (total_amount && line_items_sum) {
      const diff = Math.abs(total_amount - line_items_sum);
      const tolerance = total_amount * 0.01;
      if (diff > tolerance) {
        issues.push(`Line items sum (${line_items_sum}) doesn't match total (${total_amount})`);
      }
    }

    // Check if GST is reasonable (usually 5-28%)
    if (total_amount && gst_total) {
      const gst_percentage = (gst_total / total_amount) * 100;
      if (gst_percentage > 30 || gst_percentage < 0) {
        issues.push(`GST percentage (${gst_percentage.toFixed(2)}%) seems unreasonable`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
};

const SYSTEM_PROMPT = `You are an OCR data extraction agent specializing in Indian receipts and invoices.

You will be given raw OCR text extracted from a receipt/invoice image.

Your job is to extract structured fields accurately.

EXTRACTION RULES:
1. If amount appears both as words and numbers, use the numeric value
2. GSTIN is exactly 15 alphanumeric characters
3. Dates can be in various formats (DD/MM/YYYY, DD-MM-YY, etc.) - normalize to YYYY-MM-DD
4. For ambiguous values, set confidence lower
5. Total should equal sum of line items
6. GST total should equal CGST + SGST + IGST

Indian merchant patterns:
- Look for merchant name at top of receipt
- GST details usually at bottom
- Line items in middle section
- Total amount usually bold or emphasized

Output strict JSON format:
{
  "merchant_name": string,
  "merchant_gstin": string | null,
  "transaction_date": "YYYY-MM-DD",
  "total_amount": number,
  "currency": "INR",
  "line_items": [{
    "description": string,
    "quantity": number,
    "unit_price": number,
    "total": number,
    "hsn_code": string | null
  }],
  "gst_details": {
    "cgst": number,
    "sgst": number,
    "igst": number,
    "total_gst": number
  } | null,
  "confidence": 0.0-1.0
}`;

export class OCRAgent extends BaseAgent {
  private visionClient: vision.ImageAnnotatorClient | null = null;

  constructor() {
    super(
      'ocr_agent',
      'Extracts structured data from receipt images using Google Cloud Vision',
      [parseGSTFields, validateExtractedData]
    );

    // Initialize Google Cloud Vision only if credentials are available
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      this.visionClient = new vision.ImageAnnotatorClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials: process.env.GOOGLE_CLOUD_CREDENTIALS
          ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
          : undefined
      });
    }
  }

  async execute(input: OCRInput, context: AgentContext): Promise<OCROutput> {
    const startTime = Date.now();
    const supabase = await createClient();

    try {
      // Update receipt status
      await supabase
        .from('receipts')
        .update({ processing_status: 'processing' })
        .eq('id', input.receipt_id);

      // Perform OCR
      let ocrText: string;
      let ocrProvider: string;

      if (this.visionClient) {
        // Use Google Cloud Vision
        ocrText = await this.performGoogleVisionOCR(input.image_url);
        ocrProvider = 'google_vision';
      } else {
        // Fallback: Use Tesseract or return error
        throw new Error('No OCR provider configured. Please set up Google Cloud Vision credentials.');
      }

      // Parse with LLM
      const userPrompt = `Raw OCR text from receipt:\n\n${ocrText}\n\nExtract structured data in JSON format.`;

      const result = await this.callLLM(
        SYSTEM_PROMPT,
        userPrompt,
        context,
        3
      );

      // Parse JSON response
      let extractedData: any;
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');
        extractedData = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        throw new Error('Failed to parse LLM response');
      }

      const output: OCROutput = {
        receipt_id: input.receipt_id,
        ocr_confidence: extractedData.confidence || 0.7,
        extracted_data: {
          merchant_name: extractedData.merchant_name,
          merchant_gstin: extractedData.merchant_gstin,
          transaction_date: extractedData.transaction_date,
          total_amount: extractedData.total_amount,
          currency: extractedData.currency || 'INR',
          line_items: extractedData.line_items || [],
          gst_details: extractedData.gst_details
        },
        quality_issues: [],
        suggestions: []
      };

      // Validate data
      if (output.ocr_confidence < 0.8) {
        output.quality_issues?.push('Low OCR confidence - please review extracted data');
      }

      if (!output.extracted_data.merchant_name) {
        output.quality_issues?.push('Merchant name not found');
      }

      if (!output.extracted_data.total_amount) {
        output.quality_issues?.push('Total amount not found');
      }

      // Update receipt in database
      await supabase
        .from('receipts')
        .update({
          ocr_provider: ocrProvider,
          ocr_raw_text: ocrText,
          ocr_structured_data: extractedData,
          ocr_confidence: output.ocr_confidence,
          extracted_merchant: output.extracted_data.merchant_name,
          extracted_amount: output.extracted_data.total_amount,
          extracted_date: output.extracted_data.transaction_date,
          extracted_items: output.extracted_data.line_items,
          extracted_gst: output.extracted_data.gst_details,
          processing_status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', input.receipt_id);

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
        type: 'ocr.completed',
        data: {
          receipt_id: input.receipt_id,
          confidence: output.ocr_confidence
        },
        timestamp: new Date().toISOString(),
        context
      });

      return output;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Update receipt status to failed
      await supabase
        .from('receipts')
        .update({
          processing_status: 'failed',
          processing_error: error.message
        })
        .eq('id', input.receipt_id);

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

  private async performGoogleVisionOCR(imageUrl: string): Promise<string> {
    if (!this.visionClient) {
      throw new Error('Google Cloud Vision client not initialized');
    }

    const [result] = await this.visionClient.textDetection(imageUrl);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      throw new Error('No text detected in image');
    }

    // First annotation contains all text
    return detections[0].description || '';
  }
}

// Export singleton instance
export const ocrAgent = new OCRAgent();
