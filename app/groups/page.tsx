import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardLayout } from '@/components/layout';
import { GroupList, CreateGroupDialog, JoinGroupDialog } from '@/components/groups';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = {
  title: 'Groups | SmartSplit',
  description: 'Manage your expense groups',
};

async function GroupsContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

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
    .eq('group_members.user_id', user.id)
    .order('updated_at', { ascending: false });

  return <GroupList groups={groups || []} />;
}

function GroupsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}

export default function GroupsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
            <p className="text-muted-foreground">
              Manage your expense splitting groups
            </p>
          </div>
          <div className="flex gap-2">
            <JoinGroupDialog />
            <CreateGroupDialog />
          </div>
        </div>

        <Suspense fallback={<GroupsSkeleton />}>
          <GroupsContent />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
