import { NextResponse } from "next/server";

import { consumeRateLimit } from "../_lib/rateLimiter";

const HOT_CACHE_TTL_MS = 60_000;
const API_URL = "https://token-metrics-api1.p.rapidapi.com/v3/indices";

const CACHE: { data: any; ts: number } = { data: null, ts: 0 };

export async function GET() {
  const quota = consumeRateLimit();
  if (!quota.allowed) {
    const headers: Record<string, string> = { ...quota.headers };
    if (quota.retryAfterSeconds) {
      headers["retry-after"] = String(quota.retryAfterSeconds);
    }
    const message =
      quota.reason === "minute"
        ? "Minute rate limit reached (20 req/min). Please wait before refreshing again."
        : "Monthly quota reached (500 calls/mo).";
    return NextResponse.json(
      { success: false, message },
      {
        status: 429,
        headers,
      }
    );
  }

  const now = Date.now();
  if (CACHE.data && now - CACHE.ts < HOT_CACHE_TTL_MS) {
    return NextResponse.json(CACHE.data, {
      headers: quota.headers,
    });
  }

  const res = await fetch(API_URL, {
    headers: {
      "x-rapidapi-host": process.env.RAPIDAPI_HOST!,
      "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
    },
  });

  if (!res.ok) {
    const message = `Upstream error: ${res.status}`;
    return NextResponse.json(
      { success: false, message },
      { status: res.status, headers: quota.headers }
    );
  }

  const data = await res.json();
  CACHE.data = data;
  CACHE.ts = Date.now();

  return NextResponse.json(data, { headers: quota.headers });
}
