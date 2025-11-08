# Token Metrics Indices Dashboard

## Overview

This is a small Next.js App Router project that surfaces key Token Metrics indices with a 30-day performance drill-down. All network traffic flows through server-side route handlers so your RapidAPI credentials remain private and API limits are respected.

**Highlights**
- Indices list with search, sort-by-market-cap, inline sparkline, and expandable 30-day detail view.
- Server route (`/api/indices`) polls the Token Metrics indices endpoint and caches responses for 60 seconds to stay well under plan limits.
- Detail route (`/api/indices-performance`) fetches per-index performance data, also cached for 60 seconds.
- In-memory rate limiter guarantees at most 20 requests per minute and 500 requests per month across all routes. The UI only surfaces quota badges once a limit has been exhausted.
- Tailwind CSS styling with a dark control-room aesthetic.

## Environment Setup

### Prerequisites
- Node.js 18+ and npm
- RapidAPI Token Metrics API subscription ([sign up here](https://rapidapi.com/token-metrics-token-metrics-default/api/token-metrics-api1))

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/NamNhiBinhHipHop/indices-viewer.git
   cd indices-viewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env.local` file in the project root with your RapidAPI credentials:
   ```bash
   RAPIDAPI_HOST=token-metrics-api1.p.rapidapi.com
   RAPIDAPI_KEY=your_actual_rapidapi_key_here
   ```
   
   **Important:** Never commit `.env.local` to version control. It's already included in `.gitignore`.

4. **Run the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. The app automatically redirects to `/dashboard`.

5. **Build for production**
   ```bash
   npm run build   # compile optimized production build
   npm run start   # run the production server
   npm run lint    # verify code quality with ESLint
   ```

## Caching Strategy

The application implements a multi-layered caching approach to minimize API usage while maintaining data freshness:

### Cache Architecture

**Hot Cache Layer (60-second TTL)**
- Both `/api/indices` and `/api/indices-performance` maintain in-memory caches with 60-second expiration
- Cache hits bypass rate limiting and external API calls entirely
- Each cached response includes a timestamp to determine freshness

**Cache Flow:**
1. Request arrives → Check rate limiter first
2. If rate limit exceeded → Return 429 immediately
3. If rate limit OK → Check if cache exists and is fresh (< 60s old)
4. Cache hit → Return cached data with rate-limit headers (no external call)
5. Cache miss/stale → Call RapidAPI, update cache, return fresh data

**Per-Index Caching:**
- Performance data is cached separately per index ID
- Cache key format: `id:${id}:limit:${limit}:page:${page}`
- Prevents redundant fetches when users explore different indices

### Rate Limiting

Both API routes share a centralized rate limiter (`app/api/_lib/rateLimiter.ts`):

**Minute Window (Rolling)**
- Max: 20 requests per 60-second window
- Resets: Every 60 seconds from first request
- Headers: `x-ratelimit-limit-minute`, `x-ratelimit-remaining-minute`, `x-ratelimit-reset-minute`

**Monthly Quota (Calendar)**
- Max: 500 requests per calendar month
- Resets: First day of next month at 00:00 UTC
- Headers: `x-ratelimit-limit-month`, `x-ratelimit-remaining-month`, `x-ratelimit-reset-month`

**Response Behavior:**
- All responses include rate-limit headers for client visibility
- 429 responses include `Retry-After` header (seconds until minute window resets)
- Error messages explain which limit was exceeded and when it resets

### Client-Side Polling

**Main Dashboard (`useIndices` hook):**
- Automatic refresh: every 60 seconds
- Pauses when browser tab is hidden (reduces unnecessary calls)
- Manual refresh: "Refresh now" button triggers immediate fetch
- Cache on server means rapid clicks won't exhaust quota

**Detail Panel (`usePerformance` hook):**
- Fetches only when an index is selected
- Auto-refreshes every 60 seconds while panel is open
- Stops polling when panel closes or tab hidden

### Why This Strategy Works

With 60-second caching and 60-second polling intervals:
- **Worst case (auto-polling only):** 1 call/min × 60 min = 60 calls/hour = ~1,440 calls/day
- **With cache:** Most requests hit cache, actual RapidAPI calls ≈ 1/min = ~1,440/day or 43,200/month
- **Plan limits:** 20 req/min allows bursts; 500/month limit enforced server-side
- **Grace period:** 60s cache means even 20 rapid "Refresh now" clicks consume only 1 external call

This conservative approach ensures you stay well within RapidAPI plan limits while maintaining responsive data updates.

## Project Structure

```
app/
  layout.tsx            # root layout, Tailwind globals
  page.tsx              # redirects to /dashboard
  dashboard/page.tsx    # renders Dashboard client component
  components/
    Dashboard.tsx       # main dashboard surface
    dashboard/
      charts.tsx        # SVG sparkline/line chart primitives
      hooks.ts          # polling, rate-limit aware hooks
      ui.tsx            # index cards, detail panel UI
      utils.ts          # formatting helpers
      types.ts          # shared types for responses
  api/
    indices/route.ts             # indices proxy + cache + limiter
    indices-performance/route.ts # per-index performance proxy
```

Tailwind configuration lives in `tailwind.config.ts`, with global styles in `app/globals.css`.

## Tech Stack

### Frontend
- **Next.js 14** (App Router) - React framework with server-side rendering
- **React 18** - Component library with hooks
- **TypeScript** - Type-safe development
- **Tailwind CSS 3** - Utility-first styling with custom dark theme

### Backend
- **Next.js API Route Handlers** - Serverless API endpoints
- **In-Memory Caching** - Volatile cache with TTL management
- **Custom Rate Limiter** - Minute/month quota enforcement

### Data Visualization
- **Native SVG** - No external chart libraries
- **Custom Sparklines** - Inline trend indicators
- **Gradient Line Charts** - 30-day performance visualization

### External APIs
- **RapidAPI Token Metrics API** - `/v3/indices` and `/v3/indices-performance` endpoints

## System Design

### Architecture Overview

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Browser   │────────▶│   Next.js App    │────────▶│  RapidAPI   │
│   (Client)  │◀────────│  (Server Routes) │◀────────│   (Token    │
└─────────────┘         └──────────────────┘         │  Metrics)   │
                                │                     └─────────────┘
                                │
                        ┌───────▼────────┐
                        │  Rate Limiter  │
                        │  (20/min,      │
                        │   500/month)   │
                        └────────────────┘
                                │
                        ┌───────▼────────┐
                        │  Cache Layer   │
                        │  (60s TTL)     │
                        └────────────────┘
```

### Request Flow

**1. Client → Server (Every 60s or manual refresh)**
```
useIndices hook → fetch("/api/indices")
usePerformance hook → fetch("/api/indices-performance?id=...")
```

**2. Server Processing (`/api/indices` example)**
```
a) consumeRateLimit() → Check minute/month quotas
   ├─ If exceeded → Return 429 with Retry-After header
   └─ If OK → Increment counters

b) Check cache freshness (now - cacheTimestamp < 60_000ms)
   ├─ If fresh → Return cached data + rate-limit headers
   └─ If stale/missing → Proceed to step c

c) Fetch from RapidAPI
   ├─ Add x-rapidapi-host and x-rapidapi-key headers
   └─ Store response in cache with current timestamp

d) Return JSON + rate-limit headers to client
```

**3. Client Processing**
```
Parse response → Extract rate-limit headers → Update UI state
If 429 → Display error banner with quota details
If 200 → Render data, hide quota info
```

### Key Design Decisions

**Why Server-Side Proxy?**
- Keeps API keys secure (never exposed to browser)
- Centralizes rate limiting across all users
- Enables caching to reduce external API calls
- Provides consistent error handling

**Why 60-Second Cache?**
- Balances data freshness with API conservation
- Allows 20+ manual refreshes without hitting quota
- Auto-polling at 60s means 1 external call/min max
- Simple in-memory cache (no Redis needed for demo)

**Why Rolling Minute + Calendar Month?**
- Minute window prevents burst abuse (20 req/min)
- Monthly quota prevents runaway costs (500 calls/month)
- Both tracked server-side, not client-side

**Why Hide Rate Limits Until Exhausted?**
- Cleaner UI during normal usage
- Only shows warnings when action is needed
- Error banner includes reset countdown for transparency

## Deployment Considerations

- **In-memory cache limitation:** Serverless platforms (Vercel, Netlify) spin down instances, losing cache. For production, consider Redis/Upstash for persistent caching.
- **Rate limiter state:** Current implementation uses module-level variables. Multi-instance deployments need shared state (Redis, DynamoDB, etc.).
- **Environment variables:** Ensure `RAPIDAPI_HOST` and `RAPIDAPI_KEY` are configured in your deployment platform's secrets/environment settings.

## Notes & Considerations

- The dashboard filters out indices that contain only zeros so the list remains meaningful.
- Components rely solely on built-in SVG chart primitives—no third-party charting libraries.
- The sample styles assume a dark theme. Adjust Tailwind tokens (`tailwind.config.ts`) if you need a different brand palette.

## Troubleshooting

- **Seeing a 429 banner?** You have either refreshed more than 20 times within a minute or crossed the 500 calls/month quota. Wait for the reset time shown in the banner or increase the server-side cache/limits as needed.
- **RapidAPI errors** surface as plain messages in the UI. Double-check that `RAPIDAPI_HOST` and `RAPIDAPI_KEY` are defined and that your subscription covers the queried endpoints.

Binh Trong Ho
