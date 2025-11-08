// Lazy import to avoid build-time errors when KV env vars aren't set
let kv: any = null;
let kvInitialized = false;

const MAX_PER_MINUTE = 20;
const MAX_PER_MONTH = 500;
const MINUTE_WINDOW_MS = 60_000;

// Fallback in-memory counters for local dev or when KV isn't configured
let fallbackMinuteStart = 0;
let fallbackMinuteCount = 0;
let fallbackMonthKey = "";
let fallbackMonthCount = 0;

function initKV() {
  if (kvInitialized) return kv;
  kvInitialized = true;
  
  try {
    // Check for Vercel KV environment variables
    // Vercel uses KV_URL or KV_REST_API_URL + KV_REST_API_TOKEN
    const hasKvUrl = process.env.KV_URL;
    const hasKvRest = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    
    if (hasKvUrl || hasKvRest) {
      const vercelKv = require("@vercel/kv");
      kv = vercelKv.kv;
      console.log("[Rate Limiter] Using Vercel KV for rate limiting");
      return kv;
    }
  } catch (e) {
    console.warn("[Rate Limiter] KV not available, using in-memory fallback:", e);
  }
  
  console.log("[Rate Limiter] Using in-memory fallback (not recommended for production)");
  return null;
}

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
  const kvClient = initKV();

  // Use KV if available, otherwise fall back to in-memory
  if (!kvClient) {
    return consumeRateLimitFallback(now);
  }

  const minuteKey = "rate:minute";
  const monthKey = `rate:month:${getMonthKey()}`;

  // Get current counts
  const [minuteData, monthCount] = await Promise.all([
    kvClient.get<{ count: number; windowStart: number }>(minuteKey),
    kvClient.get<number>(monthKey),
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
    kvClient.set(
      minuteKey,
      { count: newMinuteCount, windowStart: newWindowStart },
      { ex: 60 }
    ),
    kvClient.set(monthKey, newMonthCount, { exat: monthResetSeconds }),
  ]);

  return {
    allowed: true,
    headers,
    minuteRemaining: MAX_PER_MINUTE - newMinuteCount,
    monthRemaining: MAX_PER_MONTH - newMonthCount,
  };
}

function consumeRateLimitFallback(now: number): RateLimitResult {
  // In-memory fallback when KV isn't available
  const currentMonthKey = getMonthKey();
  if (fallbackMonthKey !== currentMonthKey) {
    fallbackMonthKey = currentMonthKey;
    fallbackMonthCount = 0;
  }

  if (fallbackMinuteStart === 0 || now - fallbackMinuteStart >= MINUTE_WINDOW_MS) {
    fallbackMinuteStart = now;
    fallbackMinuteCount = 0;
  }

  const minuteRemaining = Math.max(0, MAX_PER_MINUTE - fallbackMinuteCount);
  const monthRemaining = Math.max(0, MAX_PER_MONTH - fallbackMonthCount);
  const minuteResetSeconds = Math.floor(
    (fallbackMinuteStart + MINUTE_WINDOW_MS) / 1000
  );
  const nextMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)
  );
  const monthResetSeconds = Math.floor(nextMonth.getTime() / 1000);

  const headers = {
    "x-ratelimit-limit-minute": String(MAX_PER_MINUTE),
    "x-ratelimit-remaining-minute": String(minuteRemaining),
    "x-ratelimit-reset-minute": String(minuteResetSeconds),
    "x-ratelimit-limit-month": String(MAX_PER_MONTH),
    "x-ratelimit-remaining-month": String(monthRemaining),
    "x-ratelimit-reset-month": String(monthResetSeconds),
  };

  if (fallbackMinuteCount >= MAX_PER_MINUTE) {
    const retryAfterSeconds = Math.max(
      1,
      minuteResetSeconds - Math.floor(now / 1000)
    );
    return {
      allowed: false,
      reason: "minute",
      headers,
      retryAfterSeconds,
    };
  }

  if (fallbackMonthCount >= MAX_PER_MONTH) {
    return {
      allowed: false,
      reason: "month",
      headers,
    };
  }

  fallbackMinuteCount += 1;
  fallbackMonthCount += 1;

  return {
    allowed: true,
    headers,
    minuteRemaining: MAX_PER_MINUTE - fallbackMinuteCount,
    monthRemaining: MAX_PER_MONTH - fallbackMonthCount,
  };
}

export async function rateLimitSnapshotHeaders() {
  const kvClient = initKV();
  
  if (!kvClient) {
    // Fallback headers when KV not available
    const now = Date.now();
    const nextMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)
    );
    return {
      "x-ratelimit-limit-minute": String(MAX_PER_MINUTE),
      "x-ratelimit-remaining-minute": String(
        Math.max(0, MAX_PER_MINUTE - fallbackMinuteCount)
      ),
      "x-ratelimit-reset-minute": String(
        Math.floor((fallbackMinuteStart + MINUTE_WINDOW_MS) / 1000)
      ),
      "x-ratelimit-limit-month": String(MAX_PER_MONTH),
      "x-ratelimit-remaining-month": String(
        Math.max(0, MAX_PER_MONTH - fallbackMonthCount)
      ),
      "x-ratelimit-reset-month": String(Math.floor(nextMonth.getTime() / 1000)),
    };
  }

  const minuteKey = "rate:minute";
  const monthKey = `rate:month:${getMonthKey()}`;

  const [minuteData, monthCount] = await Promise.all([
    kvClient.get<{ count: number; windowStart: number }>(minuteKey),
    kvClient.get<number>(monthKey),
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

