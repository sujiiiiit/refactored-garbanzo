/**
 * POST /api/expenses - Create manual expense
 * GET /api/expenses - List expenses with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoClassifierAgent } from '@/lib/agents/auto-classifier-agent';
import { z } from 'zod';

const CreateExpenseSchema = z.object({
  amount: z.number().positive().max(10000000),
  currency: z.string().default('INR'),
  description: z.string().min(3).max(500),
  merchant_name: z.string().max(200).optional(),
  transaction_date: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_business_expense: z.boolean().optional(),
  is_reimbursable: z.boolean().optional(),
  gst_applicable: z.boolean().optional(),
  gst_amount: z.number().optional(),
  group_id: z.string().uuid().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string()
  }).optional(),
  notes: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateExpenseSchema.parse(body);

    // Auto-classify if category not provided
    let category = validatedData.category;
    let subcategory = validatedData.subcategory;
    let classification_confidence = 1.0;
    let classification_reasoning = '';
    let gst_applicable = validatedData.gst_applicable;
    let gst_rate = null;

    if (!category) {
      const classificationResult = await autoClassifierAgent.execute({
        description: validatedData.description,
        merchant_name: validatedData.merchant_name,
        amount: validatedData.amount,
        user_id: user.id
      }, {
        user_id: user.id,
        session_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        metadata: {}
      });

      category = classificationResult.category;
      subcategory = classificationResult.subcategory || undefined;
      classification_confidence = classificationResult.confidence;
      classification_reasoning = classificationResult.reasoning;
      gst_applicable = classificationResult.gst_applicable;
      gst_rate = classificationResult.gst_rate;
    }

    // Create transaction
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: validatedData.amount,
        currency: validatedData.currency,
        description: validatedData.description,
        merchant_name: validatedData.merchant_name,
        transaction_date: validatedData.transaction_date,
        category,
        subcategory,
        tags: validatedData.tags,
        is_business_expense: validatedData.is_business_expense || false,
        is_reimbursable: validatedData.is_reimbursable || false,
        gst_applicable,
        gst_amount: validatedData.gst_amount,
        group_id: validatedData.group_id,
        location: validatedData.location,
        notes: validatedData.notes,
        source: 'manual',
        confidence_score: classification_confidence,
        agent_metadata: {
          classification: {
            reasoning: classification_reasoning,
            confidence: classification_confidence
          }
        },
        status: 'approved'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create transaction', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      transaction,
      classification: {
        category,
        subcategory,
        confidence: classification_confidence,
        reasoning: classification_reasoning
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating expense:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const from_date = searchParams.get('from_date');
    const to_date = searchParams.get('to_date');
    const category = searchParams.get('category');
    const min_amount = searchParams.get('min_amount');
    const max_amount = searchParams.get('max_amount');
    const group_id = searchParams.get('group_id');
    const search = searchParams.get('search');
    const sort_by = searchParams.get('sort_by') || 'date';
    const sort_order = searchParams.get('sort_order') || 'desc';

    // Build query
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .is('deleted_at', null);

    // Apply filters
    if (from_date) query = query.gte('transaction_date', from_date);
    if (to_date) query = query.lte('transaction_date', to_date);
    if (category) query = query.eq('category', category);
    if (min_amount) query = query.gte('amount', parseFloat(min_amount));
    if (max_amount) query = query.lte('amount', parseFloat(max_amount));
    if (group_id) query = query.eq('group_id', group_id);
    if (search) query = query.ilike('description', `%${search}%`);

    // Apply sorting
    const sortColumn = sort_by === 'date' ? 'transaction_date' : sort_by === 'amount' ? 'amount' : 'merchant_name';
    query = query.order(sortColumn, { ascending: sort_order === 'asc' });

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: transactions, error: fetchError, count } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: fetchError.message },
        { status: 500 }
      );
    }

    // Calculate aggregates
    const total_amount = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const avg_amount = transactions && transactions.length > 0 ? total_amount / transactions.length : 0;

    // Category breakdown
    const category_breakdown: Record<string, any> = {};
    transactions?.forEach(t => {
      if (!category_breakdown[t.category]) {
        category_breakdown[t.category] = {
          count: 0,
          total: 0,
          percentage: 0
        };
      }
      category_breakdown[t.category].count++;
      category_breakdown[t.category].total += Number(t.amount);
    });

    // Calculate percentages
    Object.values(category_breakdown).forEach((cat: any) => {
      cat.percentage = total_amount > 0 ? (cat.total / total_amount) * 100 : 0;
    });

    return NextResponse.json({
      transactions,
      pagination: {
        total: count || 0,
        page,
        limit,
        total_pages: count ? Math.ceil(count / limit) : 0
      },
      aggregates: {
        total_amount,
        avg_amount,
        transaction_count: transactions?.length || 0,
        category_breakdown
      }
    });

  } catch (error: any) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
