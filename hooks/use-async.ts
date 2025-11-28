'use client';

import { useState, useCallback } from 'react';

interface UseAsyncOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useAsync<T, Args extends unknown[]>(
  asyncFn: (...args: Args) => Promise<{ error: string | null; data?: T }>,
  options?: UseAsyncOptions<T>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: Args) => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);

        if (result.error) {
          setError(result.error);
          options?.onError?.(result.error);
          return { error: result.error, data: null };
        }

        setData(result.data ?? null);
        options?.onSuccess?.(result.data as T);
        return { error: null, data: result.data };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        options?.onError?.(errorMessage);
        return { error: errorMessage, data: null };
      } finally {
        setLoading(false);
      }
    },
    [asyncFn, options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
}
