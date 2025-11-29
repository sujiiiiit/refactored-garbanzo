'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Sparkles, TrendingUp, Calendar, MapPin, Check } from 'lucide-react';
import { debounce } from 'lodash';

interface SmartSuggestion {
  type: 'merchant' | 'category' | 'amount' | 'date';
  value: string | number;
  confidence: number;
  reasoning?: string;
}

interface SmartExpenseInputProps {
  onValueChange?: (field: string, value: any) => void;
  initialValues?: {
    title?: string;
    merchant?: string;
    category?: string;
    amount?: number;
  };
}

export function SmartExpenseInput({ onValueChange, initialValues }: SmartExpenseInputProps) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [merchant, setMerchant] = useState(initialValues?.merchant || '');
  const [category, setCategory] = useState(initialValues?.category || '');
  const [amount, setAmount] = useState(initialValues?.amount?.toString() || '');

  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [openMerchantPopover, setOpenMerchantPopover] = useState(false);

  // Debounced function to fetch AI suggestions
  const fetchAISuggestions = useCallback(
    debounce(async (titleValue: string, merchantValue: string) => {
      if (!titleValue && !merchantValue) {
        setSuggestions([]);
        return;
      }

      try {
        setLoadingSuggestions(true);

        // Call the auto-classifier agent to get suggestions
        const response = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: titleValue,
            merchant_name: merchantValue,
            amount: parseFloat(amount) || 0,
            preview: true // Special flag to get suggestions without creating
          })
        });

        if (response.ok) {
          const data = await response.json();

          const newSuggestions: SmartSuggestion[] = [];

          if (data.suggested_category) {
            newSuggestions.push({
              type: 'category',
              value: data.suggested_category,
              confidence: data.category_confidence || 0.7,
              reasoning: data.classification_reasoning
            });
          }

          if (data.suggested_amount && !amount) {
            newSuggestions.push({
              type: 'amount',
              value: data.suggested_amount,
              confidence: 0.6,
              reasoning: 'Based on historical spending at this merchant'
            });
          }

          setSuggestions(newSuggestions);
        }
      } catch (error) {
        console.error('Error fetching AI suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 500),
    [amount]
  );

  // Fetch merchant suggestions based on input
  const fetchMerchantSuggestions = useCallback(
    debounce(async (search: string) => {
      if (!search || search.length < 2) {
        setMerchantSuggestions([]);
        return;
      }

      try {
        // Fetch from historical transactions
        const response = await fetch(`/api/expenses?search=${encodeURIComponent(search)}&limit=10`);

        if (response.ok) {
          const data = await response.json();
          const merchants = data.expenses
            ?.map((e: any) => e.merchant_name)
            .filter((m: string) => m && m.toLowerCase().includes(search.toLowerCase()))
            .filter((m: string, i: number, arr: string[]) => arr.indexOf(m) === i) // unique
            .slice(0, 5) || [];

          setMerchantSuggestions(merchants);
        }
      } catch (error) {
        console.error('Error fetching merchant suggestions:', error);
      }
    }, 300),
    []
  );

  // Update suggestions when title or merchant changes
  useEffect(() => {
    if (title || merchant) {
      fetchAISuggestions(title, merchant);
    }
  }, [title, merchant, fetchAISuggestions]);

  // Update merchant suggestions
  useEffect(() => {
    if (merchant) {
      fetchMerchantSuggestions(merchant);
    }
  }, [merchant, fetchMerchantSuggestions]);

  // Apply suggestion
  const applySuggestion = (suggestion: SmartSuggestion) => {
    switch (suggestion.type) {
      case 'category':
        setCategory(suggestion.value as string);
        onValueChange?.('category', suggestion.value);
        break;
      case 'amount':
        setAmount(suggestion.value.toString());
        onValueChange?.('amount', suggestion.value);
        break;
      case 'merchant':
        setMerchant(suggestion.value as string);
        onValueChange?.('merchant_name', suggestion.value);
        break;
    }

    // Remove applied suggestion
    setSuggestions(prev => prev.filter(s => s !== suggestion));
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    onValueChange?.('title', value);
  };

  const handleMerchantChange = (value: string) => {
    setMerchant(value);
    onValueChange?.('merchant_name', value);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    onValueChange?.('category', value);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    onValueChange?.('amount', parseFloat(value) || 0);
  };

  return (
    <div className="space-y-4">
      {/* AI Suggestions Banner */}
      {suggestions.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-2">AI Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <Button
                    key={index}
                    onClick={() => applySuggestion(suggestion)}
                    variant="secondary"
                    size="sm"
                    className="h-auto py-2 px-3"
                  >
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium capitalize">{suggestion.type}:</span>
                        <span className="text-sm">{suggestion.value}</span>
                        <Badge variant="outline" className="ml-1">
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      {suggestion.reasoning && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {suggestion.reasoning}
                        </p>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Title Input */}
      <div className="space-y-2">
        <Label htmlFor="title">Expense Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="e.g., Lunch with team"
          className="text-base"
        />
      </div>

      {/* Merchant Input with Autocomplete */}
      <div className="space-y-2">
        <Label htmlFor="merchant">Merchant</Label>
        <Popover open={openMerchantPopover && merchantSuggestions.length > 0} onOpenChange={setOpenMerchantPopover}>
          <PopoverTrigger asChild>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="merchant"
                value={merchant}
                onChange={(e) => {
                  handleMerchantChange(e.target.value);
                  setOpenMerchantPopover(true);
                }}
                onFocus={() => setOpenMerchantPopover(true)}
                placeholder="e.g., Starbucks, Swiggy, Uber"
                className="pl-10"
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-80" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>No merchants found.</CommandEmpty>
                <CommandGroup heading="Recent Merchants">
                  {merchantSuggestions.map((m, index) => (
                    <CommandItem
                      key={index}
                      onSelect={() => {
                        handleMerchantChange(m);
                        setOpenMerchantPopover(false);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                      {m}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Start typing to see suggestions from your history
        </p>
      </div>

      {/* Amount Input with Suggestions */}
      <div className="space-y-2">
        <Label htmlFor="amount">Amount *</Label>
        <div className="relative">
          <span className="absolute left-3 top-3 text-muted-foreground">₹</span>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            className="pl-8"
          />
        </div>
        {merchant && !amount && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Typical spending at {merchant}: ₹120-250
          </p>
        )}
      </div>

      {/* Category (will be auto-filled by suggestions) */}
      {category && (
        <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Category: {category}</span>
            </div>
            <Badge variant="outline">AI Suggested</Badge>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {loadingSuggestions && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span>Analyzing...</span>
        </div>
      )}
    </div>
  );
}
