"use client";

import { useEffect, useState } from "react";

export function usePolling<T>(fn: () => Promise<T>, intervalMs = 10_000, deps: readonly unknown[] = []): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run() {
    try {
      setError(null);
      setLoading(true);
      const result = await fn();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  }, deps);

  return { data, error, loading, refresh: run };
}
