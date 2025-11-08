"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IndexRow,
  IndicesResponse,
  PerfResponse,
  PerfRow,
} from "./types";

export type RateLimitInfo = {
  minuteLimit: number | null;
  minuteRemaining: number | null;
  minuteReset: number | null;
  monthLimit: number | null;
  monthRemaining: number | null;
  monthReset: number | null;
};

function parseHeaderNumber(headers: Headers, key: string): number | null {
  const raw = headers.get(key);
  if (!raw) return null;
  const val = Number(raw);
  return Number.isFinite(val) ? val : null;
}

function extractRateLimit(headers: Headers): RateLimitInfo | null {
  const minuteLimit = parseHeaderNumber(headers, "x-ratelimit-limit-minute");
  const minuteRemaining = parseHeaderNumber(
    headers,
    "x-ratelimit-remaining-minute"
  );
  const minuteReset = parseHeaderNumber(headers, "x-ratelimit-reset-minute");
  const monthLimit = parseHeaderNumber(headers, "x-ratelimit-limit-month");
  const monthRemaining = parseHeaderNumber(
    headers,
    "x-ratelimit-remaining-month"
  );
  const monthReset = parseHeaderNumber(headers, "x-ratelimit-reset-month");

  const hasData = [
    minuteLimit,
    minuteRemaining,
    minuteReset,
    monthLimit,
    monthRemaining,
    monthReset,
  ].some((val) => val !== null);

  if (!hasData) return null;

  return {
    minuteLimit,
    minuteRemaining,
    minuteReset,
    monthLimit,
    monthRemaining,
    monthReset,
  };
}

export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState<boolean>(true);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

export function useIndices({
  refreshMs = 60_000,
  ws = false,
}: {
  refreshMs?: number;
  ws?: boolean;
}) {
  const visible = usePageVisibility();
  const [data, setData] = useState<IndexRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [limitReached, setLimitReached] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchNow = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setLoading(!hasLoadedRef.current);
      const res = await fetch("/api/indices", {
        signal: ac.signal,
        cache: "no-store",
      });
      const limitInfo = extractRateLimit(res.headers);
      setRateLimit(limitInfo);
      const limitHit =
        res.status === 429 ||
        Boolean(
          limitInfo &&
            ((limitInfo.minuteRemaining !== null &&
              limitInfo.minuteRemaining <= 0) ||
              (limitInfo.monthRemaining !== null &&
                limitInfo.monthRemaining <= 0))
        );
      setLimitReached(limitHit);
      const body = (await res.json().catch(() => null)) as
        | (IndicesResponse & { message?: string })
        | { success?: boolean; message?: string; data?: IndexRow[] }
        | null;
      if (!res.ok || !body || body.success === false) {
        const message =
          (body && typeof body.message === "string" && body.message) ||
          `HTTP ${res.status}`;
        throw new Error(message);
      }
      setData(body.data || []);
      setError(null);
      setUpdatedAt(Date.now());
      hasLoadedRef.current = true;
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNow();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchNow]);

  useEffect(() => {
    if (!visible || ws) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(fetchNow, refreshMs) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [visible, refreshMs, ws, fetchNow]);

  useEffect(() => {
    if (!ws) return;
    try {
      wsRef.current?.close();
    } catch {
      // no-op
    }
    const sock = new WebSocket(
      `${location.origin.replace("http", "ws")}/api/indices/stream`
    );
    wsRef.current = sock;
    sock.onopen = () => {};
    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "indices_update" && Array.isArray(msg.payload)) {
          setData(msg.payload as IndexRow[]);
          setUpdatedAt(Date.now());
          hasLoadedRef.current = true;
        }
      } catch {
        // swallow errors
      }
    };
    sock.onerror = () => {};
    sock.onclose = () => {};
    return () => {
      try {
        sock.close();
      } catch {
        // ignore
      }
    };
  }, [ws]);

  return {
    data,
    loading,
    error,
    refetch: fetchNow,
    updatedAt,
    rateLimit,
    limitReached,
  };
}

export function usePerformance(
  id: number | null,
  { refreshMs = 60_000 }: { refreshMs?: number }
) {
  const visible = usePageVisibility();
  const [data, setData] = useState<PerfRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchNow = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/indices-performance?id=${id}&limit=50&page=1`,
        {
          signal: ac.signal,
          cache: "no-store",
        }
      );
      const limitInfo = extractRateLimit(res.headers);
      setRateLimit(limitInfo);
      const body = (await res.json().catch(() => null)) as
        | (PerfResponse & { message?: string })
        | { success?: boolean; message?: string; data?: PerfRow[] }
        | null;
      if (!res.ok || !body || body.success === false) {
        const message =
          (body && typeof body.message === "string" && body.message) ||
          `HTTP ${res.status}`;
        throw new Error(message);
      }
      setData(body.data || []);
      setError(null);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    setRateLimit(null);
    fetchNow();
    return () => {
      abortRef.current?.abort();
    };
  }, [id, fetchNow]);

  useEffect(() => {
    if (!visible || !id) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(fetchNow, refreshMs) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [visible, id, refreshMs, fetchNow]);

  return { data, loading, error, refetch: fetchNow, rateLimit };
}

