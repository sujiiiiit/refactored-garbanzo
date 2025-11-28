import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  decimal,
  integer,
  date,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const groupTypeEnum = pgEnum('group_type', [
  'restaurant',
  'trip',
  'flat',
  'hostel',
  'subscription',
  'corporate',
  'events',
  'other',
]);

export const memberRoleEnum = pgEnum('member_role', ['admin', 'member', 'viewer']);

export const expenseCategoryEnum = pgEnum('expense_category', [
  'food',
  'travel',
  'accommodation',
  'entertainment',
  'shopping',
  'utilities',
  'rent',
  'subscription',
  'transportation',
  'healthcare',
  'corporate',
  'other',
]);

export const splitTypeEnum = pgEnum('split_type', [
  'equal',
  'unequal',
  'percentage',
  'shares',
]);

export const settlementStatusEnum = pgEnum('settlement_status', [
  'pending',
  'completed',
  'cancelled',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'upi',
  'bank_transfer',
  'card',
  'wallet',
  'other',
]);

// ============================================
// PROFILES TABLE
// Mirrors auth.users and syncs via trigger
// ============================================

export const profiles = pgTable('profiles', {
  // Primary key - same as auth.users.id
  id: uuid('id').primaryKey(),
  
  // Synced from auth.users
  email: text('email').notNull(),
  
  // From auth.users.raw_user_meta_data (Google OAuth provides these)
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  
  // Additional profile fields (user can update these)
  phone: text('phone'),
  currency: text('currency').default('USD'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================
// GROUPS TABLE
// ============================================

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  type: groupTypeEnum('type').default('other').notNull(),
  imageUrl: text('image_url'),
  currency: text('currency').default('USD'),
  inviteCode: text('invite_code').unique(),
  isBusiness: boolean('is_business').default(false),
  settings: jsonb('settings').default({}),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_groups_invite_code').on(table.inviteCode),
  index('idx_groups_created_by').on(table.createdBy),
]);

// ============================================
// GROUP MEMBERS TABLE
// ============================================

export const groupMembers = pgTable('group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  role: memberRoleEnum('role').default('member').notNull(),
  nickname: text('nickname'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_group_members_unique').on(table.groupId, table.userId),
  index('idx_group_members_group').on(table.groupId),
  index('idx_group_members_user').on(table.userId),
]);

// ============================================
// EXPENSES TABLE
// ============================================

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }).notNull(),
  description: text('description').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  paidBy: uuid('paid_by').references(() => profiles.id, { onDelete: 'set null' }),
  category: expenseCategoryEnum('category').default('other'),
  splitType: splitTypeEnum('split_type').default('equal'),
  date: date('date').defaultNow(),
  receiptUrl: text('receipt_url'),
  notes: text('notes'),
  isRecurring: boolean('is_recurring').default(false),
  recurrencePattern: text('recurrence_pattern'),
  isSettled: boolean('is_settled').default(false),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_expenses_group').on(table.groupId),
  index('idx_expenses_paid_by').on(table.paidBy),
  index('idx_expenses_date').on(table.date),
]);

// ============================================
// EXPENSE SPLITS TABLE
// ============================================

export const expenseSplits = pgTable('expense_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }),
  shares: integer('shares'),
  isPaid: boolean('is_paid').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_expense_splits_unique').on(table.expenseId, table.userId),
  index('idx_expense_splits_expense').on(table.expenseId),
  index('idx_expense_splits_user').on(table.userId),
]);

// ============================================
// SETTLEMENTS TABLE
// ============================================

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }).notNull(),
  fromUser: uuid('from_user').references(() => profiles.id, { onDelete: 'set null' }),
  toUser: uuid('to_user').references(() => profiles.id, { onDelete: 'set null' }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  status: settlementStatusEnum('status').default('pending'),
  paymentMethod: paymentMethodEnum('payment_method'),
  paymentReference: text('payment_reference'),
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_settlements_group').on(table.groupId),
  index('idx_settlements_from').on(table.fromUser),
  index('idx_settlements_to').on(table.toUser),
]);

// ============================================
// ACTIVITY LOGS TABLE
// ============================================

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_activity_logs_group').on(table.groupId),
  index('idx_activity_logs_user').on(table.userId),
]);

// ============================================
// RELATIONS
// ============================================

export const profilesRelations = relations(profiles, ({ many }) => ({
  groupMembers: many(groupMembers),
  expensesPaid: many(expenses, { relationName: 'paidBy' }),
  expensesCreated: many(expenses, { relationName: 'createdBy' }),
  expenseSplits: many(expenseSplits),
  settlementsFrom: many(settlements, { relationName: 'fromUser' }),
  settlementsTo: many(settlements, { relationName: 'toUser' }),
  activityLogs: many(activityLogs),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(profiles, {
    fields: [groups.createdBy],
    references: [profiles.id],
  }),
  members: many(groupMembers),
  expenses: many(expenses),
  settlements: many(settlements),
  activityLogs: many(activityLogs),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(profiles, {
    fields: [groupMembers.userId],
    references: [profiles.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, {
    fields: [expenses.groupId],
    references: [groups.id],
  }),
  payer: one(profiles, {
    fields: [expenses.paidBy],
    references: [profiles.id],
    relationName: 'paidBy',
  }),
  creator: one(profiles, {
    fields: [expenses.createdBy],
    references: [profiles.id],
    relationName: 'createdBy',
  }),
  splits: many(expenseSplits),
}));

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseSplits.expenseId],
    references: [expenses.id],
  }),
  user: one(profiles, {
    fields: [expenseSplits.userId],
    references: [profiles.id],
  }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, {
    fields: [settlements.groupId],
    references: [groups.id],
  }),
  payer: one(profiles, {
    fields: [settlements.fromUser],
    references: [profiles.id],
    relationName: 'fromUser',
  }),
  payee: one(profiles, {
    fields: [settlements.toUser],
    references: [profiles.id],
    relationName: 'toUser',
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  group: one(groups, {
    fields: [activityLogs.groupId],
    references: [groups.id],
  }),
  user: one(profiles, {
    fields: [activityLogs.userId],
    references: [profiles.id],
  }),
}));

// ============================================
// TYPE EXPORTS
// ============================================

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type NewExpenseSplit = typeof expenseSplits.$inferInsert;

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export type GroupType = (typeof groupTypeEnum.enumValues)[number];
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategoryEnum.enumValues)[number];
export type SplitType = (typeof splitTypeEnum.enumValues)[number];
export type SettlementStatus = (typeof settlementStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
