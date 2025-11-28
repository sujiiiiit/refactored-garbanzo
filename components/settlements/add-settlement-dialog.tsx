'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createSettlement } from '@/lib/actions/settlements';
import { useAsync } from '@/hooks';
import { toast } from 'sonner';
import { Banknote } from 'lucide-react';
import type { Profile, PaymentMethod } from '@/types';

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: '💵 Cash' },
  { value: 'upi', label: '📱 UPI' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'card', label: '💳 Card' },
  { value: 'wallet', label: '👛 Wallet' },
  { value: 'other', label: '📝 Other' },
];

const formSchema = z.object({
  from_user: z.string().min(1, 'Select who is paying'),
  to_user: z.string().min(1, 'Select who receives'),
  amount: z.string().min(1, 'Amount is required'),
  payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'wallet', 'other']),
  payment_reference: z.string().optional(),
  notes: z.string().max(200).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddSettlementDialogProps {
  groupId: string;
  members: Array<{
    user_id: string;
    profile?: Profile;
  }>;
  currency?: string;
  defaultFrom?: string;
  defaultTo?: string;
  defaultAmount?: number;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function AddSettlementDialog({
  groupId,
  members,
  currency = 'USD',
  defaultFrom,
  defaultTo,
  defaultAmount,
  trigger,
  onSuccess,
}: AddSettlementDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      from_user: defaultFrom || '',
      to_user: defaultTo || '',
      amount: defaultAmount?.toString() || '',
      payment_method: 'cash',
      payment_reference: '',
      notes: '',
    },
  });

  const fromUser = form.watch('from_user');
  const availableReceivers = members.filter((m) => m.user_id !== fromUser);

  const { execute, loading } = useAsync(createSettlement, {
    onSuccess: () => {
      toast.success('Settlement created successfully!');
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  const onSubmit = async (data: FormData) => {
    await execute({
      group_id: groupId,
      from_user: data.from_user,
      to_user: data.to_user,
      amount: parseFloat(data.amount),
      currency,
      payment_method: data.payment_method,
      payment_reference: data.payment_reference,
      notes: data.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Banknote className="mr-2 h-4 w-4" />
            Record Settlement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Record Settlement</DialogTitle>
          <DialogDescription>
            Record a payment between group members.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="from_user"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From (Who is paying)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={member.profile?.avatar_url || ''} />
                              <AvatarFallback className="text-xs">
                                {member.profile?.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            {member.profile?.full_name || member.profile?.email}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to_user"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To (Who receives)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select receiver" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableReceivers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={member.profile?.avatar_url || ''} />
                              <AvatarFallback className="text-xs">
                                {member.profile?.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            {member.profile?.full_name || member.profile?.email}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ({currency})</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="payment_reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Transaction ID, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Recording...' : 'Record Settlement'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
