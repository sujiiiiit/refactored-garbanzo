import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupList } from '@/components/groups';
import { CreateGroupDialog, JoinGroupDialog } from '@/components/groups';
import { formatCurrency } from '@/lib/split-engine';
import { 
  Users, 
  Receipt, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  Plus,
  Clock,
  Banknote
} from 'lucide-react';
import Link from 'next/link';

interface DashboardContentProps {
  userId: string;
}

export async function DashboardContent({ userId }: DashboardContentProps) {
  const supabase = await createClient();

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Fetch user's groups with members
  const { data: groups } = await supabase
    .from('groups')
    .select(`
      *,
      group_members!inner (
        user_id,
        role,
        profile:profiles (
          id,
          full_name,
          avatar_url
        )
      )
    `)
    .eq('group_members.user_id', userId)
    .order('updated_at', { ascending: false });

  // Fetch recent expenses across all groups
  const groupIds = groups?.map(g => g.id) || [];
  const { data: recentExpenses } = await supabase
    .from('expenses')
    .select(`
      *,
      paid_by_profile:profiles!expenses_paid_by_fkey (
        id,
        full_name,
        avatar_url
      ),
      group:groups (
        id,
        name
      )
    `)
    .in('group_id', groupIds)
    .order('created_at', { ascending: false })
    .limit(5);

  // Fetch pending settlements for the user
  const { data: pendingSettlements } = await supabase
    .from('settlements')
    .select(`
      *,
      from_profile:profiles!settlements_from_user_fkey (
        id,
        full_name,
        avatar_url
      ),
      to_profile:profiles!settlements_to_user_fkey (
        id,
        full_name,
        avatar_url
      ),
      group:groups (
        id,
        name,
        currency
      )
    `)
    .eq('status', 'pending')
    .or(`from_user.eq.${userId},to_user.eq.${userId}`)
    .limit(5);

  // Calculate balances across all groups
  let totalOwed = 0;
  let totalOwing = 0;

  // Get all expense splits for the user
  const { data: userSplits } = await supabase
    .from('expense_splits')
    .select(`
      amount,
      expense:expenses (
        id,
        paid_by,
        is_settled
      )
    `)
    .eq('user_id', userId);

  // Get all expenses paid by the user
  const { data: userPaidExpenses } = await supabase
    .from('expenses')
    .select(`
      id,
      amount,
      is_settled,
      splits:expense_splits (
        user_id,
        amount
      )
    `)
    .eq('paid_by', userId)
    .eq('is_settled', false);

  // Calculate what others owe the user
  userPaidExpenses?.forEach(expense => {
    expense.splits?.forEach(split => {
      if (split.user_id !== userId) {
        totalOwed += split.amount;
      }
    });
  });

  // Calculate what the user owes others
  userSplits?.forEach(split => {
    // Supabase returns single object but TS types it as array
    const expense = Array.isArray(split.expense) ? split.expense[0] : split.expense;
    if (expense && !expense.is_settled && expense.paid_by !== userId) {
      totalOwing += split.amount;
    }
  });

  const netBalance = totalOwed - totalOwing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your expense activity
          </p>
        </div>
        <div className="flex gap-2">
          <JoinGroupDialog />
          <CreateGroupDialog />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active expense groups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">You&apos;re Owed</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalOwed, profile?.currency || 'USD')}
            </div>
            <p className="text-xs text-muted-foreground">
              From group members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">You Owe</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalOwing, profile?.currency || 'USD')}
            </div>
            <p className="text-xs text-muted-foreground">
              To group members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              netBalance > 0 ? 'text-green-600' : netBalance < 0 ? 'text-red-600' : ''
            }`}>
              {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance, profile?.currency || 'USD')}
            </div>
            <p className="text-xs text-muted-foreground">
              {netBalance >= 0 ? 'In your favor' : 'You need to pay'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Expenses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Expenses</CardTitle>
              <CardDescription>Latest expenses across all groups</CardDescription>
            </div>
            <Link href="/reports">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentExpenses && recentExpenses.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {recentExpenses.map((expense) => (
                    <div key={expense.id} className="flex items-center gap-4">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={expense.paid_by_profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {expense.paid_by_profile?.full_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{expense.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {expense.group?.name} • {expense.paid_by_profile?.full_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {formatCurrency(expense.amount, expense.currency)}
                        </p>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {expense.category}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Receipt className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No expenses yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Add an expense to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Settlements */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Settlements</CardTitle>
              <CardDescription>Payments awaiting confirmation</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {pendingSettlements && pendingSettlements.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {pendingSettlements.map((settlement) => {
                    const isFromUser = settlement.from_user === userId;
                    return (
                      <div key={settlement.id} className="flex items-center gap-4 p-3 rounded-lg border">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">
                              {isFromUser ? 'You' : settlement.from_profile?.full_name}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">
                              {!isFromUser && settlement.to_user === userId ? 'You' : settlement.to_profile?.full_name}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {settlement.group?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">
                            {formatCurrency(settlement.amount, settlement.group?.currency || 'USD')}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Banknote className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No pending settlements
                </p>
                <p className="text-xs text-muted-foreground">
                  All caught up!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Groups */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Groups</h2>
          <Link href="/groups">
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <GroupList groups={groups?.slice(0, 6) || []} />
      </div>
    </div>
  );
}
