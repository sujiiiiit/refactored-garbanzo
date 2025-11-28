'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/split-engine';
import { format } from 'date-fns';
import type { Settlement, DebtSimplification } from '@/types';
import { ArrowRight, Check, X, Clock, Banknote } from 'lucide-react';
import { completeSettlement, cancelSettlement } from '@/lib/actions/settlements';
import { useAsync } from '@/hooks';
import { toast } from 'sonner';

interface SettlementCardProps {
  settlement: Settlement;
  currency?: string;
  currentUserId?: string;
  onUpdate?: () => void;
}

export function SettlementCard({
  settlement,
  currency = 'USD',
  currentUserId,
  onUpdate,
}: SettlementCardProps) {
  const isFromUser = settlement.from_user === currentUserId;
  const isToUser = settlement.to_user === currentUserId;

  const { execute: markComplete, loading: completing } = useAsync(
    () => completeSettlement(settlement.id),
    {
      onSuccess: () => {
        toast.success('Settlement marked as completed!');
        onUpdate?.();
      },
      onError: (error) => toast.error(error),
    }
  );

  const { execute: cancel, loading: cancelling } = useAsync(
    () => cancelSettlement(settlement.id),
    {
      onSuccess: () => {
        toast.success('Settlement cancelled');
        onUpdate?.();
      },
      onError: (error) => toast.error(error),
    }
  );

  const statusBadge = {
    pending: <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>,
    completed: <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><Check className="mr-1 h-3 w-3" />Completed</Badge>,
    cancelled: <Badge variant="destructive"><X className="mr-1 h-3 w-3" />Cancelled</Badge>,
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Avatar className="h-10 w-10">
              <AvatarImage src={settlement.from_profile?.avatar_url || ''} />
              <AvatarFallback>
                {settlement.from_profile?.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {settlement.from_profile?.full_name || 'Unknown'}
              </span>
              {isFromUser && <span className="text-xs text-muted-foreground">(You)</span>}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold">
              {formatCurrency(settlement.amount, currency)}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium">
                {settlement.to_profile?.full_name || 'Unknown'}
              </span>
              {isToUser && <span className="text-xs text-muted-foreground">(You)</span>}
            </div>
            <Avatar className="h-10 w-10">
              <AvatarImage src={settlement.to_profile?.avatar_url || ''} />
              <AvatarFallback>
                {settlement.to_profile?.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusBadge[settlement.status]}
            {settlement.payment_method && (
              <Badge variant="outline" className="capitalize">
                {settlement.payment_method.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {settlement.status === 'pending' && isToUser && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancel()}
                disabled={cancelling}
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => markComplete()}
                disabled={completing}
              >
                <Check className="h-4 w-4 mr-1" />
                Confirm
              </Button>
            </div>
          )}

          {settlement.status === 'completed' && settlement.settled_at && (
            <span className="text-xs text-muted-foreground">
              Settled on {format(new Date(settlement.settled_at), 'MMM d, yyyy')}
            </span>
          )}
        </div>

        {settlement.notes && (
          <p className="mt-2 text-sm text-muted-foreground border-t pt-2">
            {settlement.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface SuggestedSettlementCardProps {
  debt: DebtSimplification;
  currency?: string;
  currentUserId?: string;
  groupId: string;
  onSettle?: () => void;
}

export function SuggestedSettlementCard({
  debt,
  currency = 'USD',
  currentUserId,
  groupId,
  onSettle,
}: SuggestedSettlementCardProps) {
  const isFromUser = debt.from === currentUserId;

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm">
              <span className="font-medium">{debt.from_name}</span>
              {isFromUser && <span className="text-muted-foreground"> (You)</span>}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold text-primary">
              {formatCurrency(debt.amount, currency)}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="text-sm">
              <span className="font-medium">{debt.to_name}</span>
              {debt.to === currentUserId && <span className="text-muted-foreground"> (You)</span>}
            </span>
          </div>

          {isFromUser && (
            <Button size="sm" onClick={onSettle}>
              <Banknote className="h-4 w-4 mr-1" />
              Settle
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SettlementListProps {
  settlements: Settlement[];
  currency?: string;
  currentUserId?: string;
  onUpdate?: () => void;
}

export function SettlementList({
  settlements,
  currency = 'USD',
  currentUserId,
  onUpdate,
}: SettlementListProps) {
  if (settlements.length === 0) {
    return (
      <div className="text-center py-8">
        <Banknote className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No settlements yet</h3>
        <p className="text-muted-foreground">
          Settlements will appear here when created
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {settlements.map((settlement) => (
        <SettlementCard
          key={settlement.id}
          settlement={settlement}
          currency={currency}
          currentUserId={currentUserId}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
