'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCurrency } from '@/lib/split-engine';
import type { Group, GroupType } from '@/types';
import Link from 'next/link';
import {
  UtensilsCrossed,
  Plane,
  Home,
  Building,
  CreditCard,
  PartyPopper,
  Users,
  MoreHorizontal,
} from 'lucide-react';

const groupTypeIcons: Record<GroupType, typeof Users> = {
  restaurant: UtensilsCrossed,
  trip: Plane,
  flat: Home,
  hostel: Building,
  subscription: CreditCard,
  corporate: Building,
  events: PartyPopper,
  other: Users,
};

const groupTypeColors: Record<GroupType, string> = {
  restaurant: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  trip: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  flat: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  hostel: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  subscription: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  corporate: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  events: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

interface GroupCardProps {
  group: Group & {
    group_members?: Array<{
      user_id: string;
      profile?: {
        avatar_url?: string;
        full_name?: string;
      };
    }>;
  };
  balance?: number;
}

export function GroupCard({ group, balance }: GroupCardProps) {
  const Icon = groupTypeIcons[group.type] || Users;
  const members = group.group_members || [];

  return (
    <Link href={`/groups/${group.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${groupTypeColors[group.type]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">{group.name}</CardTitle>
                <Badge variant="secondary" className="mt-1 text-xs capitalize">
                  {group.type}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {group.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {group.description}
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex -space-x-2">
              {members.slice(0, 4).map((member, i) => (
                <Avatar key={i} className="h-7 w-7 border-2 border-background">
                  <AvatarImage src={member.profile?.avatar_url || ''} />
                  <AvatarFallback className="text-xs">
                    {member.profile?.full_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 4 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-xs">
                  +{members.length - 4}
                </div>
              )}
            </div>
            
            {balance !== undefined && (
              <div className={`text-sm font-medium ${
                balance > 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : balance < 0 
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
              }`}>
                {balance > 0 ? '+' : ''}
                {formatCurrency(balance, group.currency)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface GroupListProps {
  groups: Array<Group & { group_members?: unknown[] }>;
  balances?: Record<string, number>;
}

export function GroupList({ groups, balances = {} }: GroupListProps) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No groups yet</h3>
        <p className="text-muted-foreground">
          Create your first group to start splitting expenses
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group as GroupCardProps['group']}
          balance={balances[group.id]}
        />
      ))}
    </div>
  );
}
