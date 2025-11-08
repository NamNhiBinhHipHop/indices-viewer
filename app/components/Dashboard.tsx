// Dashboard.tsx
// Drop-in React component for a minimal indices dashboard with a 30-day detail view.
// Client fetches ONLY your internal routes (/api/indices, /api/indices-performance?id=...),
// which MUST encapsulate RapidAPI calls, env secrets, caching, and rate limiting.
// Polling cadence: ~60s (backoff on tab hidden).
//
// Place this file anywhere you render React components (e.g., Next.js app/page).
// No external chart libs; inline SVG sparkline + 30-day chart.

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { useIndices } from "./dashboard/hooks";
import type { IndexRow } from "./dashboard/types";
import { classNames, formatNum, formatPct } from "./dashboard/utils";
import { DetailPanel, IndexRowCard } from "./dashboard/ui";

function SummaryCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "slate" | "emerald" | "rose" | "sky";
}) {
  return (
    <div
      className={classNames(
        "rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-sm backdrop-blur transition hover:border-white/20",
        tone === "emerald"
          ? "hover:shadow-[0_8px_24px_rgba(20,241,149,0.18)]"
          : tone === "rose"
          ? "hover:shadow-[0_8px_24px_rgba(241,91,130,0.18)]"
          : tone === "sky"
          ? "hover:shadow-[0_8px_24px_rgba(56,189,248,0.18)]"
          : undefined
      )}
    >
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div
        className={classNames(
          "mt-2 text-2xl font-semibold",
          tone === "emerald"
            ? "text-emerald-glow"
            : tone === "rose"
            ? "text-rose-glow"
            : tone === "sky"
            ? "text-sky-200"
            : "text-slate-50"
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [query, setQuery] = useState("");
  const { data, loading, error, refetch, updatedAt, rateLimit, limitReached } =
    useIndices({
      refreshMs: 60_000,
    });
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo<IndexRow[]>(() => {
    const xs = (data ?? []).filter(
      (r) =>
        (r.price && r.price !== 0) ||
        (r.market_cap && r.market_cap !== 0) ||
        (r["1_m"] && r["1_m"] !== 0) ||
        (r["24_h"] && r["24_h"] !== 0) ||
        (r["7_d"] && r["7_d"] !== 0)
    );
    return xs;
  }, [data]);

  const trendMap = useMemo(() => {
    const map = new Map<number, number[]>();
    rows.forEach((r) => {
      const v24 = r["24_h"] ?? 0;
      const v7 = r["7_d"] ?? 0;
      const v30 = r["1_m"] ?? 0;
      const vals = [0, v24 * 0.33, v24, v24 + (v7 - v24) * 0.5, v7, v7 + (v30 - v7) * 0.5, v30];
      map.set(r.id, vals);
    });
    return map;
  }, [rows]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort(
      (a, b) =>
        (b.market_cap ?? 0) - (a.market_cap ?? 0) ||
        (b["1_m"] ?? 0) - (a["1_m"] ?? 0)
    );
    return copy;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter(
      (row) =>
        row.ticker.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q)
    );
  }, [sortedRows, query]);

  const summary = useMemo(() => {
    if (!rows.length) {
      return null;
    }
    const totalCap = rows.reduce((acc, row) => acc + (row.market_cap || 0), 0);
    const avgGrade =
      rows.reduce((acc, row) => acc + (row.index_grade || 0), 0) /
      rows.length;
    const monthlyLeader = [...rows]
      .sort(
        (a, b) =>
          (b["1_m"] ?? Number.NEGATIVE_INFINITY) -
          (a["1_m"] ?? Number.NEGATIVE_INFINITY)
      )
      .at(0);
    const dailyLeader = [...rows]
      .sort(
        (a, b) =>
          (b["24_h"] ?? Number.NEGATIVE_INFINITY) -
          (a["24_h"] ?? Number.NEGATIVE_INFINITY)
      )
      .at(0);

    return {
      totalCap,
      avgGrade,
      monthlyLeader: monthlyLeader ?? null,
      dailyLeader: dailyLeader ?? null,
    };
  }, [rows]);

  const selectedRow = useMemo(() => {
    if (!openId) return null;
    return rows.find((row) => row.id === openId) ?? null;
  }, [openId, rows]);

  const handleOpen = useCallback((id: number) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const lastSyncedLabel = useMemo(() => {
    if (!updatedAt) return null;
    const date = new Date(updatedAt);
    return `${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  }, [updatedAt]);

  const activeCount = filteredRows.length;
  const minuteLimit = rateLimit?.minuteLimit ?? null;
  const monthLimit = rateLimit?.monthLimit ?? null;
  const minuteRemaining = rateLimit?.minuteRemaining ?? null;
  const monthRemaining = rateLimit?.monthRemaining ?? null;
  const minuteResetTime = rateLimit?.minuteReset
    ? new Date(rateLimit.minuteReset * 1000)
    : null;
  const monthResetTime = rateLimit?.monthReset
    ? new Date(rateLimit.monthReset * 1000)
    : null;
  const minuteResetLabel = minuteResetTime
    ? minuteResetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const monthResetLabel = monthResetTime
    ? `${monthResetTime.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })} ${monthResetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;
  const minuteRemainingZero =
    minuteRemaining !== null && minuteRemaining <= 0;
  const monthRemainingZero =
    monthRemaining !== null && monthRemaining <= 0;
  const showLimitBadges =
    limitReached || minuteRemainingZero || monthRemainingZero;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-slate-100">
      <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-panel backdrop-blur">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-glow/30 bg-emerald-glow/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-glow">
            Token Metrics
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Indices &amp; Indicators Control Room
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
            Monitor market-moving Token Metrics indices, track momentum over the last 30 days, and drill into performance without leaving the app.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300 md:text-sm">
          {lastSyncedLabel && (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
              Last sync {lastSyncedLabel}
            </span>
          )}
          {loading && (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
              Fetching latest…
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
            Showing {activeCount} indices
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-emerald-glow/60 hover:text-emerald-glow disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => refetch()}
            disabled={loading}
          >
            Refresh now
          </button>
        </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-glow/50 bg-rose-glow/10 px-4 py-3 text-sm text-rose-100">
            <div className="font-semibold uppercase tracking-wide">Request issue</div>
            <div className="mt-1 text-rose-100/90">{error}</div>
            {showLimitBadges && minuteLimit !== null && (
              <div className="mt-2 text-[11px] uppercase tracking-wide text-rose-100/80">
                Minute quota {minuteLimit} • remaining{" "}
                {minuteRemaining !== null ? Math.max(minuteRemaining, 0) : "—"}
                {minuteResetLabel ? ` • resets ${minuteResetLabel}` : ""}
              </div>
            )}
            {showLimitBadges && monthLimit !== null && (
              <div className="text-[11px] uppercase tracking-wide text-rose-100/80">
                Monthly quota {monthLimit} • remaining{" "}
                {monthRemaining !== null ? Math.max(monthRemaining, 0) : "—"}
                {monthResetLabel ? ` • resets ${monthResetLabel}` : ""}
              </div>
            )}
          </div>
        )}
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total market cap"
          value={`$${formatNum(summary?.totalCap ?? 0, {
            notation: "compact",
            maximumFractionDigits: 2,
          })}`}
          sub={
            summary
              ? `${formatNum(summary.totalCap / rows.length, {
                  notation: "compact",
                  maximumFractionDigits: 2,
                })} avg per index`
              : "Waiting for data"
          }
          tone="emerald"
        />
        <SummaryCard
          label="Indices tracked"
          value={rows.length ? formatNum(rows.length) : "—"}
          sub={
            summary
              ? `Avg grade ${summary.avgGrade.toFixed(1)} • zero-only rows filtered`
              : "Filtered list hides zero-only records"
          }
          tone="sky"
        />
        <SummaryCard
          label="30d leader"
          value={summary?.monthlyLeader?.ticker ?? "—"}
          sub={
            summary?.monthlyLeader
              ? formatPct(summary.monthlyLeader["1_m"])
              : "Awaiting data"
          }
          tone={
            summary?.monthlyLeader && (summary.monthlyLeader["1_m"] ?? 0) < 0
              ? "rose"
              : "emerald"
          }
        />
        <SummaryCard
          label="24h momentum"
          value={summary?.dailyLeader?.ticker ?? "—"}
          sub={
            summary?.dailyLeader
              ? formatPct(summary.dailyLeader["24_h"])
              : "Awaiting data"
          }
          tone={
            summary?.dailyLeader && (summary.dailyLeader["24_h"] ?? 0) < 0
              ? "rose"
              : "emerald"
          }
        />
      </section>

      <main className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full max-w-md">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by ticker or name…"
                className="w-full rounded-2xl border border-white/10 bg-night-900/60 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-glow focus:outline-none"
              />
            </div>
          </div>

          <div className="relative mt-4 flex-1">
            <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin">
              {loading && !rows.length && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/[0.06]"
                    />
                  ))}
                </div>
              )}

              {filteredRows.map((row) => (
                <IndexRowCard
                  key={row.id}
                  row={row}
                  active={openId === row.id}
                  onOpen={handleOpen}
                  trendSample={trendMap.get(row.id) ?? [0]}
                />
              ))}

              {!loading && filteredRows.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">
                  No indices match “{query}”. Try a different ticker or clear the
                  search.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[360px] flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-lg backdrop-blur">
          {selectedRow ? (
            <DetailPanel row={selectedRow} onClose={() => setOpenId(null)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-slate-300">
              <div className="text-lg font-semibold text-slate-100">
                Select an index to explore its 30-day arc
              </div>
              <p className="max-w-xs text-xs text-slate-400">
                Choose any index from the list to unlock cumulative ROI, drawdowns, and key
                fundamentals. Data auto-refreshes roughly every 60 seconds.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="mt-12 text-xs text-slate-500">
        Server routes enforce RapidAPI rate limits (20 req/min, 500/mo) with cache windows between 60–120s. Client polling pauses automatically whenever the tab is hidden.
      </footer>
    </div>
  );
}
