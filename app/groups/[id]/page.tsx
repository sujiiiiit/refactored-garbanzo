import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardLayout } from '@/components/layout';
import { GroupDetailContent } from './group-detail-content';
import { Skeleton } from '@/components/ui/skeleton';

interface GroupPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GroupPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', id)
    .single();

  return {
    title: group ? `${group.name} | SmartSplit` : 'Group | SmartSplit',
  };
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is a member of this group
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    notFound();
  }

  return (
    <DashboardLayout>
      <Suspense fallback={<GroupDetailSkeleton />}>
        <GroupDetailContent groupId={id} userId={user.id} userRole={membership.role} />
      </Suspense>
    </DashboardLayout>
  );
}

function GroupDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
