// ============================================
// SmartSplit - Type Definitions
// ============================================

// Enums
export type GroupType = 
  | 'restaurant' 
  | 'trip' 
  | 'flat' 
  | 'hostel' 
  | 'subscription' 
  | 'corporate' 
  | 'events' 
  | 'other';

export type MemberRole = 'admin' | 'member' | 'viewer';

export type ExpenseCategory = 
  | 'food' 
  | 'travel' 
  | 'accommodation' 
  | 'entertainment' 
  | 'shopping' 
  | 'utilities' 
  | 'rent' 
  | 'subscription' 
  | 'transportation' 
  | 'healthcare' 
  | 'corporate' 
  | 'other';

export type SplitType = 'equal' | 'unequal' | 'percentage' | 'shares';

export type SettlementStatus = 'pending' | 'completed' | 'cancelled';

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'wallet' | 'other';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// ============================================
// Database Models
// ============================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  currency: string;
  is_business_user: boolean;
  company_id: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  image_url: string | null;
  currency: string;
  invite_code: string;
  is_business: boolean;
  company_id: string | null;
  department_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  nickname: string | null;
  joined_at: string;
  // Joined fields
  profile?: Profile;
}

export interface Expense {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  paid_by: string | null;
  category: ExpenseCategory;
  split_type: SplitType;
  expense_date: string;
  is_recurring: boolean;
  recurring_interval: string | null;
  next_occurrence: string | null;
  is_settled: boolean;
  requires_approval: boolean;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  paid_by_profile?: Profile;
  splits?: ExpenseSplit[];
  attachments?: Attachment[];
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  percentage: number | null;
  shares: number | null;
  is_paid: boolean;
  created_at: string;
  // Joined fields
  profile?: Profile;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_user: string | null;
  to_user: string | null;
  amount: number;
  currency: string;
  status: SettlementStatus;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  notes: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  from_profile?: Profile;
  to_profile?: Profile;
}

export interface Attachment {
  id: string;
  expense_id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface RecurringExpense {
  id: string;
  expense_id: string;
  interval: string;
  start_date: string;
  end_date: string | null;
  next_occurrence: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Business/Corporate Models
// ============================================

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  currency: string;
  billing_email: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  budget: number | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessWallet {
  id: string;
  company_id: string;
  department_id: string | null;
  balance: number;
  contribution_percentage: number;
  monthly_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  expense_id: string | null;
  amount: number;
  transaction_type: 'credit' | 'debit';
  description: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  expense_id: string;
  requested_by: string | null;
  approver_id: string | null;
  status: ApprovalStatus;
  comments: string | null;
  reviewed_at: string | null;
  created_at: string;
  // Joined fields
  expense?: Expense;
  requester?: Profile;
  approver?: Profile;
}

export interface ActivityLog {
  id: string;
  group_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // Joined fields
  user?: Profile;
}

// ============================================
// Computed/View Types
// ============================================

export interface GroupBalance {
  group_id: string;
  user_id: string;
  full_name: string;
  email: string;
  total_paid: number;
  total_owed: number;
  balance: number;
}

export interface DebtSimplification {
  from: string;
  from_name: string;
  to: string;
  to_name: string;
  amount: number;
}

export interface GroupSummary {
  total_expenses: number;
  total_settlements: number;
  member_count: number;
  unsettled_amount: number;
  category_breakdown: Record<ExpenseCategory, number>;
  monthly_spending: { month: string; amount: number }[];
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateGroupRequest {
  name: string;
  description?: string;
  type: GroupType;
  image_url?: string;
  currency?: string;
  is_business?: boolean;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  type?: GroupType;
  image_url?: string;
  currency?: string;
}

export interface CreateExpenseRequest {
  group_id: string;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  paid_by: string;
  category?: ExpenseCategory;
  split_type: SplitType;
  expense_date?: string;
  is_recurring?: boolean;
  recurring_interval?: string;
  participants: ExpenseParticipant[];
}

export interface ExpenseParticipant {
  user_id: string;
  amount?: number;
  percentage?: number;
  shares?: number;
}

export interface UpdateExpenseRequest {
  title?: string;
  description?: string;
  amount?: number;
  category?: ExpenseCategory;
  expense_date?: string;
}

export interface CreateSettlementRequest {
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  currency?: string;
  payment_method?: PaymentMethod;
  payment_reference?: string;
  notes?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// Form Types
// ============================================

export interface ExpenseFormData {
  title: string;
  description: string;
  amount: string;
  category: ExpenseCategory;
  split_type: SplitType;
  expense_date: Date;
  paid_by: string;
  is_recurring: boolean;
  recurring_interval?: string;
  participants: {
    user_id: string;
    included: boolean;
    amount?: string;
    percentage?: string;
    shares?: string;
  }[];
}

export interface GroupFormData {
  name: string;
  description: string;
  type: GroupType;
  currency: string;
  is_business: boolean;
}

export interface SettlementFormData {
  from_user: string;
  to_user: string;
  amount: string;
  payment_method: PaymentMethod;
  payment_reference: string;
  notes: string;
}
