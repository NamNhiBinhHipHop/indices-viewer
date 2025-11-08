const MAX_PER_MINUTE = 20;
const MAX_PER_MONTH = 500;
const MINUTE_WINDOW_MS = 60_000;

let minuteWindowStart = 0;
let minuteCount = 0;

let monthKey = "";
let monthCount = 0;

function ensureMinuteWindow(now: number) {
  if (minuteWindowStart === 0 || now - minuteWindowStart >= MINUTE_WINDOW_MS) {
    minuteWindowStart = now;
    minuteCount = 0;
  }
}

function getMonthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function ensureMonthWindow(now: number) {
  const key = getMonthKey(now);
  if (monthKey !== key) {
    monthKey = key;
    monthCount = 0;
  }
}

function nextMonthResetEpochSeconds(now: number): number {
  const d = new Date(now);
  const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return Math.floor(nextMonth / 1000);
}

function minuteResetEpochSeconds(): number {
  return Math.floor((minuteWindowStart + MINUTE_WINDOW_MS) / 1000);
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

function buildHeaders(now: number, currentMinuteCount: number, currentMonthCount: number) {
  const minuteRemaining = Math.max(0, MAX_PER_MINUTE - currentMinuteCount);
  const monthRemaining = Math.max(0, MAX_PER_MONTH - currentMonthCount);
  return {
    "x-ratelimit-limit-minute": String(MAX_PER_MINUTE),
    "x-ratelimit-remaining-minute": String(minuteRemaining),
    "x-ratelimit-reset-minute": String(minuteResetEpochSeconds()),
    "x-ratelimit-limit-month": String(MAX_PER_MONTH),
    "x-ratelimit-remaining-month": String(monthRemaining),
    "x-ratelimit-reset-month": String(nextMonthResetEpochSeconds(now)),
  } satisfies Record<string, string>;
}

export function consumeRateLimit(): RateLimitResult {
  const now = Date.now();
  ensureMinuteWindow(now);
  ensureMonthWindow(now);

  if (minuteCount >= MAX_PER_MINUTE) {
    const headers = buildHeaders(now, minuteCount, monthCount);
    const retryAfterSeconds = Math.max(1, minuteResetEpochSeconds() - Math.floor(now / 1000));
    return { allowed: false, reason: "minute", headers, retryAfterSeconds };
  }

  if (monthCount >= MAX_PER_MONTH) {
    const headers = buildHeaders(now, minuteCount, monthCount);
    return { allowed: false, reason: "month", headers };
  }

  minuteCount += 1;
  monthCount += 1;
  const headers = buildHeaders(now, minuteCount, monthCount);
  return {
    allowed: true,
    headers,
    minuteRemaining: Math.max(0, MAX_PER_MINUTE - minuteCount),
    monthRemaining: Math.max(0, MAX_PER_MONTH - monthCount),
  };
}

export function rateLimitSnapshotHeaders() {
  const now = Date.now();
  ensureMinuteWindow(now);
  ensureMonthWindow(now);
  return buildHeaders(now, minuteCount, monthCount);
}
