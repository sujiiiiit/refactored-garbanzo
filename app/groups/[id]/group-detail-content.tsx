'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ExpenseList, AddExpenseDialog } from '@/components/expenses';
import { SettlementList, SuggestedSettlementCard, AddSettlementDialog } from '@/components/settlements';
import { formatCurrency } from '@/lib/split-engine';
import { getSuggestedSettlements } from '@/lib/actions/settlements';
import { getGroupExpenses, getExpenseStats } from '@/lib/actions/expenses';
import { getGroupSettlements } from '@/lib/actions/settlements';
import { regenerateInviteCode, leaveGroup } from '@/lib/actions/groups';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Users,
  Receipt,
  Banknote,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Copy,
  QrCode,
  Settings,
  LogOut,
  UserPlus,
  Share2,
  RefreshCw,
} from 'lucide-react';
import type { Group, GroupMember, Expense, Settlement, DebtSimplification, Profile, MemberRole } from '@/types';

interface GroupDetailContentProps {
  groupId: string;
  userId: string;
  userRole: MemberRole;
}

export function GroupDetailContent({ groupId, userId, userRole }: GroupDetailContentProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { profile: Profile })[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [suggestedSettlements, setSuggestedSettlements] = useState<DebtSimplification[]>([]);
  const [stats, setStats] = useState<{
    totalExpenses: number;
    settledExpenses: number;
    unsettledExpenses: number;
    categoryBreakdown: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const isAdmin = userRole === 'admin';

  const fetchData = async () => {
    setLoading(true);

    // Fetch group details
    const { data: groupData } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();
    
    if (groupData) setGroup(groupData);

    // Fetch members
    const { data: membersData } = await supabase
      .from('group_members')
      .select(`
        *,
        profile:profiles (*)
      `)
      .eq('group_id', groupId);
    
    if (membersData) setMembers(membersData as (GroupMember & { profile: Profile })[]);

    // Fetch expenses
    const expenseResult = await getGroupExpenses(groupId);
    if (expenseResult.data) setExpenses(expenseResult.data);

    // Fetch settlements
    const settlementResult = await getGroupSettlements(groupId);
    if (settlementResult.data) setSettlements(settlementResult.data);

    // Fetch suggested settlements
    const suggestedResult = await getSuggestedSettlements(groupId);
    if (suggestedResult.data) setSuggestedSettlements(suggestedResult.data);

    // Fetch stats
    const statsResult = await getExpenseStats(groupId);
    if (statsResult.data) setStats(statsResult.data);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  // Real-time subscriptions
  useEffect(() => {
    const expenseChannel = supabase
      .channel('group_expenses')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const settlementChannel = supabase
      .channel('group_settlements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlements',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(expenseChannel);
      supabase.removeChannel(settlementChannel);
    };
  }, [groupId]);

  const copyInviteCode = () => {
    if (group?.invite_code) {
      navigator.clipboard.writeText(group.invite_code);
      toast.success('Invite code copied!');
    }
  };

  const handleRegenerateCode = async () => {
    const result = await regenerateInviteCode(groupId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('New invite code generated!');
      fetchData();
    }
  };

  const handleLeaveGroup = async () => {
    const result = await leaveGroup(groupId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('You have left the group');
      router.push('/groups');
    }
  };

  // Calculate user's balance
  const userBalance = suggestedSettlements.reduce((acc, debt) => {
    if (debt.from === userId) return acc - debt.amount;
    if (debt.to === userId) return acc + debt.amount;
    return acc;
  }, 0);

  if (loading || !group) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground text-2xl font-bold">
            {group.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{group.name}</h1>
              <Badge variant="secondary" className="capitalize">{group.type}</Badge>
              {group.is_business && <Badge>Business</Badge>}
            </div>
            {group.description && (
              <p className="text-muted-foreground mt-1">{group.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {members.length} members
              </span>
              <span className="flex items-center gap-1">
                <Receipt className="h-4 w-4" />
                {expenses.length} expenses
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInviteDialog(true)}>
            <Share2 className="h-4 w-4 mr-2" />
            Invite
          </Button>
          <AddExpenseDialog
            groupId={groupId}
            members={members}
            currency={group.currency}
            onSuccess={fetchData}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Group Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  Group Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Members
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowLeaveDialog(true)}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Leave Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.totalExpenses || 0, group.currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unsettled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats?.unsettledExpenses || 0, group.currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Your Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              userBalance > 0 ? 'text-green-600' : userBalance < 0 ? 'text-red-600' : ''
            }`}>
              {userBalance >= 0 ? '+' : ''}{formatCurrency(userBalance, group.currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              {userBalance > 0 ? 'You are owed' : userBalance < 0 ? 'You owe' : 'All settled'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((member) => (
                <Avatar key={member.user_id} className="h-8 w-8 border-2 border-background">
                  <AvatarImage src={member.profile?.avatar_url || ''} />
                  <AvatarFallback>
                    {member.profile?.full_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 5 && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs">
                  +{members.length - 5}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suggested Settlements */}
      {suggestedSettlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Suggested Settlements
            </CardTitle>
            <CardDescription>
              Optimized payments to settle all debts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestedSettlements.map((debt, index) => (
                <SuggestedSettlementCard
                  key={index}
                  debt={debt}
                  currency={group.currency}
                  currentUserId={userId}
                  groupId={groupId}
                  onSettle={() => {
                    // Open settlement dialog with pre-filled values
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">All Expenses</h2>
            <AddExpenseDialog
              groupId={groupId}
              members={members}
              currency={group.currency}
              onSuccess={fetchData}
              trigger={<Button size="sm">Add Expense</Button>}
            />
          </div>
          <ExpenseList expenses={expenses} currency={group.currency} />
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Settlement History</h2>
            <AddSettlementDialog
              groupId={groupId}
              members={members}
              currency={group.currency}
              onSuccess={fetchData}
            />
          </div>
          <SettlementList
            settlements={settlements}
            currency={group.currency}
            currentUserId={userId}
            onUpdate={fetchData}
          />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <h2 className="text-lg font-semibold">Group Members</h2>
          <div className="space-y-3">
            {members.map((member) => (
              <Card key={member.user_id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.profile?.avatar_url || ''} />
                      <AvatarFallback>
                        {member.profile?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {member.profile?.full_name || 'Unknown'}
                        {member.user_id === userId && (
                          <span className="text-muted-foreground"> (You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {member.profile?.email}
                      </p>
                    </div>
                  </div>
                  <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                    {member.role}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Members</DialogTitle>
            <DialogDescription>
              Share this code with friends to invite them to the group
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={group.invite_code}
                readOnly
                className="font-mono text-center text-xl tracking-widest"
              />
              <Button variant="outline" size="icon" onClick={copyInviteCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleRegenerateCode}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate New Code
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Group Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave &quot;{group.name}&quot;? You will need an invite code to rejoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeaveGroup}>
              Leave Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
