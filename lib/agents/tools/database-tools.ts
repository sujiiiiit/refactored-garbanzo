/**
 * Database Tools for Agents
 * These tools allow agents to query and manipulate data
 */

import { AgentTool, AgentContext } from '../core/base-agent';
import { createClient } from '@/lib/supabase/server';

export const fetchUserCategorizationHistory: AgentTool = {
  name: 'fetch_user_categorization_history',
  description: "Retrieve user's past transaction categorizations to learn their preferences and patterns",
  input_schema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'UUID of the user'
      },
      merchant_name: {
        type: 'string',
        description: 'Optional: Merchant name to find similar transactions for (fuzzy match supported)'
      },
      limit: {
        type: 'number',
        description: 'Number of past transactions to fetch (default 20, max 50)'
      }
    },
    required: ['user_id']
  },
  execute: async (input: any, context: AgentContext) => {
    const { user_id, merchant_name, limit = 20 } = input;
    const supabase = await createClient();

    let query = supabase
      .from('transactions')
      .select('id, description, merchant_name, category, subcategory, amount, created_at')
      .eq('user_id', user_id)
      .not('category', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 50));

    // If merchant name provided, fuzzy match
    if (merchant_name) {
      query = query.ilike('merchant_name', `%${merchant_name}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return {
      transactions: data,
      count: data?.length || 0
    };
  }
};

export const getMerchantCategoryMapping: AgentTool = {
  name: 'get_merchant_category_mapping',
  description: 'Look up known category for a merchant from database (supports fuzzy matching)',
  input_schema: {
    type: 'object',
    properties: {
      merchant_name: {
        type: 'string',
        description: 'Name of the merchant (case-insensitive, fuzzy match supported)'
      }
    },
    required: ['merchant_name']
  },
  execute: async (input: any, context: AgentContext) => {
    const { merchant_name } = input;
    const supabase = await createClient();

    // Find most common category for this merchant
    const { data, error } = await supabase
      .from('transactions')
      .select('category, subcategory, merchant_name')
      .ilike('merchant_name', `%${merchant_name}%`)
      .not('category', 'is', null)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        found: false,
        message: 'No historical data found for this merchant'
      };
    }

    // Count category occurrences
    const categoryCounts: Record<string, number> = {};
    data.forEach(t => {
      const key = `${t.category}|${t.subcategory || ''}`;
      categoryCounts[key] = (categoryCounts[key] || 0) + 1;
    });

    // Find most common
    const mostCommon = Object.entries(categoryCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    const [category, subcategory] = mostCommon[0].split('|');

    return {
      found: true,
      merchant_name: data[0].merchant_name,
      category,
      subcategory: subcategory || null,
      confidence: mostCommon[1] / data.length,
      sample_count: data.length
    };
  }
};

export const getCategoryList: AgentTool = {
  name: 'get_category_list',
  description: 'Get list of all valid expense categories and subcategories with GST rates',
  input_schema: {
    type: 'object',
    properties: {
      persona: {
        type: 'string',
        description: 'Filter categories by persona (individual or business)'
      }
    },
    required: []
  },
  execute: async (input: any, context: AgentContext) => {
    const { persona } = input;
    const supabase = await createClient();

    let query = supabase
      .from('expense_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (persona) {
      query = query.contains('applicable_to', [persona]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Group by parent category
    const grouped: Record<string, any[]> = {};
    data?.forEach(cat => {
      const parent = cat.parent_category || 'root';
      if (!grouped[parent]) {
        grouped[parent] = [];
      }
      grouped[parent].push({
        name: cat.name,
        gst_rate: cat.default_gst_rate,
        gl_code: cat.gl_code,
        hsn_sac: cat.default_hsn_sac
      });
    });

    return {
      categories: grouped,
      total_count: data?.length || 0
    };
  }
};

export const applyGSTRules: AgentTool = {
  name: 'apply_gst_rules',
  description: 'Determine GST applicability and rate for a category (India-specific)',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Expense category name'
      },
      amount: {
        type: 'number',
        description: 'Transaction amount (optional, for special cases)'
      }
    },
    required: ['category']
  },
  execute: async (input: any, context: AgentContext) => {
    const { category, amount } = input;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('name', category)
      .single();

    if (error || !data) {
      return {
        gst_applicable: true,
        gst_rate: 18.0, // Default GST rate
        hsn_sac_code: null,
        message: 'Category not found, using default GST rate'
      };
    }

    return {
      gst_applicable: data.default_gst_rate !== null && data.default_gst_rate > 0,
      gst_rate: data.default_gst_rate,
      hsn_sac_code: data.default_hsn_sac,
      gl_code: data.gl_code
    };
  }
};

export const queryTransactions: AgentTool = {
  name: 'query_transactions',
  description: 'Query transactions with filters for analysis',
  input_schema: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'User ID to query transactions for'
      },
      entity_id: {
        type: 'string',
        description: 'Entity ID for business queries'
      },
      from_date: {
        type: 'string',
        description: 'Start date (ISO 8601)'
      },
      to_date: {
        type: 'string',
        description: 'End date (ISO 8601)'
      },
      category: {
        type: 'string',
        description: 'Filter by category'
      },
      merchant_name: {
        type: 'string',
        description: 'Filter by merchant (fuzzy match)'
      },
      min_amount: {
        type: 'number',
        description: 'Minimum amount'
      },
      max_amount: {
        type: 'number',
        description: 'Maximum amount'
      },
      limit: {
        type: 'number',
        description: 'Number of transactions to return (max 100)'
      }
    },
    required: []
  },
  execute: async (input: any, context: AgentContext) => {
    const {
      user_id,
      entity_id,
      from_date,
      to_date,
      category,
      merchant_name,
      min_amount,
      max_amount,
      limit = 50
    } = input;

    const supabase = await createClient();

    let query = supabase
      .from('transactions')
      .select('*')
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .limit(Math.min(limit, 100));

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_id) query = query.eq('entity_id', entity_id);
    if (from_date) query = query.gte('transaction_date', from_date);
    if (to_date) query = query.lte('transaction_date', to_date);
    if (category) query = query.eq('category', category);
    if (merchant_name) query = query.ilike('merchant_name', `%${merchant_name}%`);
    if (min_amount) query = query.gte('amount', min_amount);
    if (max_amount) query = query.lte('amount', max_amount);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Calculate summary statistics
    const total = data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const avg = data && data.length > 0 ? total / data.length : 0;

    return {
      transactions: data,
      count: data?.length || 0,
      summary: {
        total_amount: total,
        average_amount: avg,
        currency: data?.[0]?.currency || 'INR'
      }
    };
  }
};

// Export all database tools
export const databaseTools: AgentTool[] = [
  fetchUserCategorizationHistory,
  getMerchantCategoryMapping,
  getCategoryList,
  applyGSTRules,
  queryTransactions,
];
