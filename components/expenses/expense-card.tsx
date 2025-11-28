'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCurrency } from '@/lib/split-engine';
import { format } from 'date-fns';
import type { Expense, ExpenseCategory } from '@/types';
import {
  UtensilsCrossed,
  Plane,
  Home,
  Tv,
  ShoppingBag,
  Zap,
  Car,
  HeartPulse,
  Building,
  MoreHorizontal,
  Receipt,
  Paperclip,
} from 'lucide-react';

const categoryIcons: Record<ExpenseCategory, typeof Receipt> = {
  food: UtensilsCrossed,
  travel: Plane,
  accommodation: Home,
  entertainment: Tv,
  shopping: ShoppingBag,
  utilities: Zap,
  rent: Home,
  subscription: Tv,
  transportation: Car,
  healthcare: HeartPulse,
  corporate: Building,
  other: Receipt,
};

const categoryColors: Record<ExpenseCategory, string> = {
  food: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  travel: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accommodation: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  entertainment: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  shopping: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  utilities: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  rent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  subscription: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  transportation: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  healthcare: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  corporate: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

interface ExpenseCardProps {
  expense: Expense;
  currency?: string;
  onClick?: () => void;
}

export function ExpenseCard({ expense, currency = 'USD', onClick }: ExpenseCardProps) {
  const Icon = categoryIcons[expense.category] || Receipt;
  const payer = expense.paid_by_profile;
  const hasAttachments = expense.attachments && expense.attachments.length > 0;

  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${categoryColors[expense.category]}`}>
            <Icon className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium truncate">{expense.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(expense.expense_date), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {formatCurrency(expense.amount, currency)}
                </p>
                {expense.is_recurring && (
                  <Badge variant="outline" className="text-xs">
                    Recurring
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span>Paid by</span>
                <Avatar className="h-5 w-5">
                  <AvatarImage src={payer?.avatar_url || ''} />
                  <AvatarFallback className="text-xs">
                    {payer?.full_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">
                  {payer?.full_name || 'Unknown'}
                </span>
              </div>
              
              {expense.splits && expense.splits.length > 0 && (
                <span>• Split {expense.splits.length} ways</span>
              )}
              
              {hasAttachments && (
                <span className="flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  {expense.attachments!.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ExpenseListProps {
  expenses: Expense[];
  currency?: string;
  onExpenseClick?: (expense: Expense) => void;
}

export function ExpenseList({ expenses, currency = 'USD', onExpenseClick }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No expenses yet</h3>
        <p className="text-muted-foreground">
          Add your first expense to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => (
        <ExpenseCard
          key={expense.id}
          expense={expense}
          currency={currency}
          onClick={() => onExpenseClick?.(expense)}
        />
      ))}
    </div>
  );
}
