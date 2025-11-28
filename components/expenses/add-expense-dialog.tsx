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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createExpense } from '@/lib/actions/expenses';
import { useAsync } from '@/hooks';
import { toast } from 'sonner';
import { Plus, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Profile, ExpenseCategory, SplitType } from '@/types';

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: '🍕 Food' },
  { value: 'travel', label: '✈️ Travel' },
  { value: 'accommodation', label: '🏨 Accommodation' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'shopping', label: '🛍️ Shopping' },
  { value: 'utilities', label: '💡 Utilities' },
  { value: 'rent', label: '🏠 Rent' },
  { value: 'subscription', label: '📺 Subscription' },
  { value: 'transportation', label: '🚗 Transportation' },
  { value: 'healthcare', label: '🏥 Healthcare' },
  { value: 'other', label: '📁 Other' },
];

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().max(500).optional(),
  amount: z.string().min(1, 'Amount is required'),
  category: z.enum(['food', 'travel', 'accommodation', 'entertainment', 'shopping', 'utilities', 'rent', 'subscription', 'transportation', 'healthcare', 'corporate', 'other']),
  paid_by: z.string().min(1, 'Select who paid'),
  expense_date: z.date(),
  split_type: z.enum(['equal', 'unequal', 'percentage', 'shares']),
  is_recurring: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface AddExpenseDialogProps {
  groupId: string;
  members: Array<{
    user_id: string;
    profile?: Profile;
  }>;
  currency?: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function AddExpenseDialog({
  groupId,
  members,
  currency = 'USD',
  trigger,
  onSuccess,
}: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    members.map((m) => m.user_id)
  );
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [splitPercentages, setSplitPercentages] = useState<Record<string, string>>({});
  const [splitShares, setSplitShares] = useState<Record<string, string>>({});

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      amount: '',
      category: 'other',
      paid_by: '',
      expense_date: new Date(),
      split_type: 'equal',
      is_recurring: false,
    },
  });

  const splitType = form.watch('split_type');
  const amount = parseFloat(form.watch('amount')) || 0;

  const { execute, loading } = useAsync(createExpense, {
    onSuccess: () => {
      toast.success('Expense added successfully!');
      setOpen(false);
      form.reset();
      setSelectedMembers(members.map((m) => m.user_id));
      setSplitAmounts({});
      setSplitPercentages({});
      setSplitShares({});
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  const onSubmit = async (data: FormData) => {
    const participants = selectedMembers.map((userId) => ({
      user_id: userId,
      amount: parseFloat(splitAmounts[userId]) || undefined,
      percentage: parseFloat(splitPercentages[userId]) || undefined,
      shares: parseInt(splitShares[userId]) || undefined,
    }));

    await execute({
      group_id: groupId,
      title: data.title,
      description: data.description,
      amount: parseFloat(data.amount),
      currency,
      paid_by: data.paid_by,
      category: data.category,
      split_type: data.split_type,
      expense_date: format(data.expense_date, 'yyyy-MM-dd'),
      is_recurring: data.is_recurring,
      participants,
    });
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const equalSplitAmount = selectedMembers.length > 0 
    ? (amount / selectedMembers.length).toFixed(2) 
    : '0.00';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Expense</DialogTitle>
          <DialogDescription>
            Add an expense and split it among group members.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Dinner at restaurant" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
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
                name="paid_by"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid By</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Who paid?" />
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
                name="expense_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
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

            {/* Split Section */}
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="split_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Split Type</FormLabel>
                    <Tabs value={field.value} onValueChange={field.onChange}>
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="equal">Equal</TabsTrigger>
                        <TabsTrigger value="unequal">Exact</TabsTrigger>
                        <TabsTrigger value="percentage">%</TabsTrigger>
                        <TabsTrigger value="shares">Shares</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Split Among</FormLabel>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-3 p-2 rounded-lg border"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.user_id)}
                        onCheckedChange={() => toggleMember(member.user_id)}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {member.profile?.full_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium">
                        {member.profile?.full_name || member.profile?.email}
                      </span>

                      {selectedMembers.includes(member.user_id) && (
                        <>
                          {splitType === 'equal' && (
                            <span className="text-sm text-muted-foreground">
                              {currency} {equalSplitAmount}
                            </span>
                          )}
                          {splitType === 'unequal' && (
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="w-24 h-8"
                              value={splitAmounts[member.user_id] || ''}
                              onChange={(e) =>
                                setSplitAmounts((prev) => ({
                                  ...prev,
                                  [member.user_id]: e.target.value,
                                }))
                              }
                            />
                          )}
                          {splitType === 'percentage' && (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="0"
                                className="w-16 h-8"
                                value={splitPercentages[member.user_id] || ''}
                                onChange={(e) =>
                                  setSplitPercentages((prev) => ({
                                    ...prev,
                                    [member.user_id]: e.target.value,
                                  }))
                                }
                              />
                              <span className="text-sm">%</span>
                            </div>
                          )}
                          {splitType === 'shares' && (
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              placeholder="1"
                              className="w-16 h-8"
                              value={splitShares[member.user_id] || ''}
                              onChange={(e) =>
                                setSplitShares((prev) => ({
                                  ...prev,
                                  [member.user_id]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="is_recurring"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Recurring expense</FormLabel>
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
                {loading ? 'Adding...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
