# Token Metrics Indices Dashboard

## Overview

This is a small Next.js App Router project that surfaces key Token Metrics indices with a 30-day performance drill-down. All network traffic flows through server-side route handlers so your RapidAPI credentials remain private and API limits are respected.

**Highlights**
- Indices list with search, sort-by-market-cap, inline sparkline, and expandable 30-day detail view.
- Server route (`/api/indices`) polls the Token Metrics indices endpoint and caches responses for 60 seconds to stay well under plan limits.
- Detail route (`/api/indices-performance`) fetches per-index performance data, also cached for 60 seconds.
- In-memory rate limiter guarantees at most 20 requests per minute and 500 requests per month across all routes. The UI only surfaces quota badges once a limit has been exhausted.
- Tailwind CSS styling with a dark control-room aesthetic.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Create a `.env.local` file in the project root and set your RapidAPI credentials:
   ```bash
   RAPIDAPI_HOST=token-metrics-api1.p.rapidapi.com
   RAPIDAPI_KEY=your_rapidapi_key
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`. The landing page redirects to `/dashboard` where the client component renders the dashboard UI.

4. **Build or lint**
   ```bash
   npm run build   # compile for production
   npm run start   # run the production build
   npm run lint    # run Next.js ESLint rules
   ```

## Data Flow & Rate Limiting

- The `useIndices` hook (client side) polls `/api/indices` every 60 seconds unless the tab is hidden. Manual refreshes reuse the same endpoint.
- `/api/indices` fetches `https://token-metrics-api1.p.rapidapi.com/v3/indices`, caches the JSON response in memory for 60 seconds, and returns rate-limit headers reflecting remaining minute/month usage.
- `/api/indices-performance` forwards to `https://token-metrics-api1.p.rapidapi.com/v3/indices-performance` (limit=50, page=1 by default), also cached for 60 seconds per id.
- Both handlers share an in-memory rate limiter (`app/api/_lib/rateLimiter.ts`) that:
  - allows at most 20 calls per rolling minute,
  - allows at most 500 calls per calendar month,
  - returns `429` with `Retry-After` when either cap is exceeded.
- The React hooks parse response headers and only display quota information if you actually exhaust the limit, keeping the interface clean during normal usage.

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

## Notes & Considerations

- The dashboard filters out indices that contain only zeros so the list remains meaningful.
- Components rely solely on built-in SVG chart primitives—no third-party charting libraries.
- The project uses persistent in-memory caches and rate counters; if you deploy to a serverless environment you may want to replace these with a shared store (Redis, Upstash, etc.).
- The sample styles assume a dark theme. Adjust Tailwind tokens (`tailwind.config.ts`) if you need a different brand palette.

## Troubleshooting

- **Seeing a 429 banner?** You have either refreshed more than 20 times within a minute or crossed the 500 calls/month quota. Wait for the reset time shown in the banner or increase the server-side cache/limits as needed.
- **RapidAPI errors** surface as plain messages in the UI. Double-check that `RAPIDAPI_HOST` and `RAPIDAPI_KEY` are defined and that your subscription covers the queried endpoints.

Happy hacking! 🚀
