import { kv } from "@vercel/kv";

const MAX_PER_MINUTE = 20;
const MAX_PER_MONTH = 500;
const MINUTE_WINDOW_MS = 60_000;

function getMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

type RateLimitResult =
  | {
      allowed: true;
      headers: Record<string, string>;
      minuteRemaining: number;
      monthRemaining: number;
    }
  | {
      allowed: false;
      headers: Record<string, string>;
      reason: "minute" | "month";
      retryAfterSeconds?: number;
    };

export async function consumeRateLimit(): Promise<RateLimitResult> {
  const now = Date.now();
  const minuteKey = "rate:minute";
  const monthKey = `rate:month:${getMonthKey()}`;

  // Get current counts
  const [minuteData, monthCount] = await Promise.all([
    kv.get<{ count: number; windowStart: number }>(minuteKey),
    kv.get<number>(monthKey),
  ]);

  // Check/reset minute window
  const minuteWindowStart = minuteData?.windowStart ?? now;
  const isMinuteExpired = now - minuteWindowStart >= MINUTE_WINDOW_MS;
  const currentMinuteCount = isMinuteExpired ? 0 : (minuteData?.count ?? 0);
  const currentMonthCount = monthCount ?? 0;

  // Build headers
  const minuteRemaining = Math.max(0, MAX_PER_MINUTE - currentMinuteCount);
  const monthRemaining = Math.max(0, MAX_PER_MONTH - currentMonthCount);
  const minuteResetSeconds = Math.ceil(
    (minuteWindowStart + MINUTE_WINDOW_MS - now) / 1000
  );
  const nextMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)
  );
  const monthResetSeconds = Math.floor(nextMonth.getTime() / 1000);

  const headers = {
    "x-ratelimit-limit-minute": String(MAX_PER_MINUTE),
    "x-ratelimit-remaining-minute": String(minuteRemaining),
    "x-ratelimit-reset-minute": String(
      Math.floor((minuteWindowStart + MINUTE_WINDOW_MS) / 1000)
    ),
    "x-ratelimit-limit-month": String(MAX_PER_MONTH),
    "x-ratelimit-remaining-month": String(monthRemaining),
    "x-ratelimit-reset-month": String(monthResetSeconds),
  };

  // Check limits
  if (currentMinuteCount >= MAX_PER_MINUTE) {
    return {
      allowed: false,
      reason: "minute",
      headers,
      retryAfterSeconds: Math.max(1, minuteResetSeconds),
    };
  }

  if (currentMonthCount >= MAX_PER_MONTH) {
    return {
      allowed: false,
      reason: "month",
      headers,
    };
  }

  // Increment counters
  const newMinuteCount = currentMinuteCount + 1;
  const newMonthCount = currentMonthCount + 1;
  const newWindowStart = isMinuteExpired ? now : minuteWindowStart;

  await Promise.all([
    kv.set(
      minuteKey,
      { count: newMinuteCount, windowStart: newWindowStart },
      { ex: 60 }
    ),
    kv.set(monthKey, newMonthCount, { exat: monthResetSeconds }),
  ]);

  return {
    allowed: true,
    headers,
    minuteRemaining: MAX_PER_MINUTE - newMinuteCount,
    monthRemaining: MAX_PER_MONTH - newMonthCount,
  };
}

export async function rateLimitSnapshotHeaders() {
  const minuteKey = "rate:minute";
  const monthKey = `rate:month:${getMonthKey()}`;

  const [minuteData, monthCount] = await Promise.all([
    kv.get<{ count: number; windowStart: number }>(minuteKey),
    kv.get<number>(monthKey),
  ]);

  const now = Date.now();
  const minuteWindowStart = minuteData?.windowStart ?? now;
  const currentMinuteCount = minuteData?.count ?? 0;
  const currentMonthCount = monthCount ?? 0;

  const nextMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)
  );

  return {
    "x-ratelimit-limit-minute": String(MAX_PER_MINUTE),
    "x-ratelimit-remaining-minute": String(
      Math.max(0, MAX_PER_MINUTE - currentMinuteCount)
    ),
    "x-ratelimit-reset-minute": String(
      Math.floor((minuteWindowStart + MINUTE_WINDOW_MS) / 1000)
    ),
    "x-ratelimit-limit-month": String(MAX_PER_MONTH),
    "x-ratelimit-remaining-month": String(
      Math.max(0, MAX_PER_MONTH - currentMonthCount)
    ),
    "x-ratelimit-reset-month": String(Math.floor(nextMonth.getTime() / 1000)),
  };
}

