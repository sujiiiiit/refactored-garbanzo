import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/split-engine';
import { 
  PieChart, 
  BarChart3, 
  TrendingUp, 
  Calendar,
  Receipt,
  Users
} from 'lucide-react';

export const metadata = {
  title: 'Reports | SmartSplit',
  description: 'View your expense reports and analytics',
};

async function ReportsContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('currency')
    .eq('id', user.id)
    .single();

  const currency = profile?.currency || 'USD';

  // Get all user's groups
  const { data: groups } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id);

  const groupIds = groups?.map(g => g.group_id) || [];

  // Get all expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .in('group_id', groupIds);

  // Calculate statistics
  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const expenseCount = expenses?.length || 0;
  const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  expenses?.forEach(expense => {
    const cat = expense.category || 'other';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + expense.amount;
  });

  // Monthly breakdown (last 6 months)
  const monthlyBreakdown: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyBreakdown[key] = 0;
  }
  
  expenses?.forEach(expense => {
    const month = expense.expense_date.substring(0, 7);
    if (monthlyBreakdown.hasOwnProperty(month)) {
      monthlyBreakdown[month] += expense.amount;
    }
  });

  // Group breakdown
  const { data: groupsWithExpenses } = await supabase
    .from('groups')
    .select('id, name')
    .in('id', groupIds);

  const groupBreakdown: Record<string, { name: string; amount: number }> = {};
  groupsWithExpenses?.forEach(group => {
    const groupExpenses = expenses?.filter(e => e.group_id === group.id) || [];
    const total = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
    groupBreakdown[group.id] = { name: group.name, amount: total };
  });

  // Sort categories by amount
  const sortedCategories = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1]);

  // Sort groups by amount
  const sortedGroups = Object.entries(groupBreakdown)
    .sort((a, b) => b[1].amount - a[1].amount);

  const categoryLabels: Record<string, string> = {
    food: '🍕 Food',
    travel: '✈️ Travel',
    accommodation: '🏨 Accommodation',
    entertainment: '🎬 Entertainment',
    shopping: '🛍️ Shopping',
    utilities: '💡 Utilities',
    rent: '🏠 Rent',
    subscription: '📺 Subscription',
    transportation: '🚗 Transportation',
    healthcare: '🏥 Healthcare',
    corporate: '🏛️ Corporate',
    other: '📁 Other',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Analytics and insights for your expenses
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalExpenses, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all groups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expenseCount}</div>
            <p className="text-xs text-muted-foreground">
              Total transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(avgExpense, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per expense
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groupIds.length}</div>
            <p className="text-xs text-muted-foreground">
              Active groups
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Spending by Category
            </CardTitle>
            <CardDescription>
              How your expenses are distributed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedCategories.map(([category, amount]) => {
                const percentage = totalExpenses > 0 
                  ? Math.round((amount / totalExpenses) * 100) 
                  : 0;
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{categoryLabels[category] || category}</span>
                      <span className="font-medium">
                        {formatCurrency(amount, currency)} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {sortedCategories.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No expense data yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monthly Spending
            </CardTitle>
            <CardDescription>
              Last 6 months overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(monthlyBreakdown).map(([month, amount]) => {
                const maxAmount = Math.max(...Object.values(monthlyBreakdown), 1);
                const percentage = Math.round((amount / maxAmount) * 100);
                const date = new Date(month + '-01');
                const label = date.toLocaleDateString('en-US', { 
                  month: 'short', 
                  year: 'numeric' 
                });
                return (
                  <div key={month} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-medium">
                        {formatCurrency(amount, currency)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Group Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Spending by Group
          </CardTitle>
          <CardDescription>
            Expenses per group
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedGroups.map(([groupId, { name, amount }]) => {
              const percentage = totalExpenses > 0 
                ? Math.round((amount / totalExpenses) * 100) 
                : 0;
              return (
                <div key={groupId} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span>
                      {formatCurrency(amount, currency)} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {sortedGroups.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No group data yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsContent />
      </Suspense>
    </DashboardLayout>
  );
}
