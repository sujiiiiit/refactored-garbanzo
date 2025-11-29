'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GroupList } from './group-card';
import type { Group } from '@/types';

interface GroupsListWrapperProps {
  initialGroups: Array<Group & { group_members?: unknown[] }>;
  userId: string;
}

export function GroupsListWrapper({ initialGroups, userId }: GroupsListWrapperProps) {
  const [groups, setGroups] = useState(initialGroups);
  const supabase = createClient();

  useEffect(() => {
    // Fetch fresh data
    const fetchGroups = async () => {
      const { data } = await supabase
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

      if (data) {
        setGroups(data);
      }
    };

    // Subscribe to group changes
    const groupsChannel = supabase
      .channel('user_groups')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
        },
        () => {
          fetchGroups();
        }
      )
      .subscribe();

    // Subscribe to group_members changes (for when user joins a group)
    const membersChannel = supabase
      .channel('user_group_members')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(groupsChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [userId, supabase]);

  return <GroupList groups={groups} />;
}
