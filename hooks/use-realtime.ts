'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeOptions<T> {
  table: string;
  filter?: { column: string; value: string };
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: T) => void;
}

export function useRealtime<T extends { id: string }>({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeOptions<T>) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    
    let realtimeChannel = supabase.channel(`${table}_changes`);

    const filterString = filter ? `${filter.column}=eq.${filter.value}` : undefined;

    realtimeChannel = realtimeChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: filterString,
      },
      (payload: RealtimePostgresChangesPayload<T>) => {
        if (payload.eventType === 'INSERT' && onInsert) {
          onInsert(payload.new as T);
        } else if (payload.eventType === 'UPDATE' && onUpdate) {
          onUpdate(payload.new as T);
        } else if (payload.eventType === 'DELETE' && onDelete) {
          onDelete(payload.old as T);
        }
      }
    );

    realtimeChannel.subscribe();
    setChannel(realtimeChannel);

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [table, filter?.column, filter?.value, onInsert, onUpdate, onDelete]);

  return channel;
}

export function useRealtimeGroup(groupId: string) {
  const [expenses, setExpenses] = useState<unknown[]>([]);
  const [settlements, setSettlements] = useState<unknown[]>([]);

  const handleExpenseInsert = useCallback((payload: unknown) => {
    setExpenses(prev => [payload, ...prev]);
  }, []);

  const handleExpenseUpdate = useCallback((payload: { id: string }) => {
    setExpenses(prev => prev.map(e => 
      (e as { id: string }).id === payload.id ? payload : e
    ));
  }, []);

  const handleExpenseDelete = useCallback((payload: { id: string }) => {
    setExpenses(prev => prev.filter(e => (e as { id: string }).id !== payload.id));
  }, []);

  const handleSettlementInsert = useCallback((payload: unknown) => {
    setSettlements(prev => [payload, ...prev]);
  }, []);

  useRealtime({
    table: 'expenses',
    filter: { column: 'group_id', value: groupId },
    onInsert: handleExpenseInsert,
    onUpdate: handleExpenseUpdate,
    onDelete: handleExpenseDelete,
  });

  useRealtime({
    table: 'settlements',
    filter: { column: 'group_id', value: groupId },
    onInsert: handleSettlementInsert,
  });

  return { expenses, settlements, setExpenses, setSettlements };
}
