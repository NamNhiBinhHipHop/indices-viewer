import { NextResponse } from "next/server";

import { consumeRateLimit } from "../_lib/rateLimiterKV";

const HOT_CACHE_TTL_MS = 60_000;

const CACHE = new Map<string, { data: any; ts: number }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { success: false, message: "id required" },
      { status: 400 }
    );

  const limit = searchParams.get("limit") ?? "50";
  const page = searchParams.get("page") ?? "1";

  const key = `id:${id}:limit:${limit}:page:${page}`;
  const cached = CACHE.get(key);
  const quota = await consumeRateLimit();
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

  if (cached && Date.now() - cached.ts < HOT_CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: quota.headers,
    });
  }

  const url = `https://token-metrics-api1.p.rapidapi.com/v3/indices-performance?limit=${limit}&page=${page}&id=${id}`;
  const res = await fetch(url, {
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
  CACHE.set(key, { data, ts: Date.now() });

  return NextResponse.json(data, { headers: quota.headers });
}
