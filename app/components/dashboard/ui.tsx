"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useMemo } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { LineChart, Sparkline } from "./charts";
import { usePerformance } from "./hooks";
import type { IndexRow, PerfRow } from "./types";
import { classNames, formatNum, formatPct } from "./utils";

type StatCellProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  tone?: "default" | "emerald" | "rose";
};

export function StatCell({
  label,
  value,
  sub,
  className,
  tone = "default",
}: StatCellProps) {
  return (
    <div className={classNames("flex flex-col gap-1", className)}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={classNames(
          "text-sm font-semibold",
          tone === "emerald"
            ? "text-emerald-glow"
            : tone === "rose"
            ? "text-rose-glow"
            : "text-slate-100"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function IndexRowCard({
  row,
  onOpen,
  trendSample,
  active = false,
}: {
  row: IndexRow;
  onOpen: (id: number) => void;
  trendSample: number[];
  active?: boolean;
}) {
  const monthlyGain = row["1_m"] ?? 0;
  const sparkTone = monthlyGain >= 0 ? "text-emerald-glow" : "text-rose-glow";
  const topIcons = row.top_gainers_icons
    ? Object.entries(row.top_gainers_icons).slice(0, 3)
    : [];
  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(row.id);
      }
    },
    [onOpen, row.id]
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      onKeyDown={handleKey}
      aria-pressed={active}
      className={classNames(
        "group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-glow/60 sm:flex-row sm:items-center sm:justify-between",
        active
          ? "border-emerald-glow/60 bg-emerald-glow/[0.08] shadow-panel"
          : "hover:border-white/20 hover:bg-white/[0.08]"
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-night-900/70 text-base font-semibold uppercase tracking-tight text-slate-100 shadow-inner">
          {row.ticker.slice(0, 3)}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-lg font-semibold tracking-tight text-slate-50">
            {row.ticker}
          </div>
          <div className="text-sm text-slate-400">{row.name}</div>
          {topIcons.length > 0 && (
            <div className="flex items-center gap-2 pt-1 text-[11px] uppercase tracking-wide text-slate-500">
              <span className="text-slate-500">Top components</span>
              <div className="flex items-center gap-1">
                {topIcons.map(([key, token]) => {
                  const iconSrc = token.small || token.thumb || token.large;
                  return (
                    <img
                      key={key}
                      src={iconSrc}
                      alt={token.name}
                      className="h-6 w-6 rounded-full border border-white/10 object-cover shadow-sm"
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="grid w-full grid-cols-2 gap-3 text-slate-100 sm:w-auto sm:grid-cols-3 lg:grid-cols-5">
          <StatCell
            label="Price"
            value={`$${formatNum(row.price, { maximumFractionDigits: 4 })}`}
            className="min-w-[120px]"
          />
          <StatCell
            label="24h"
            value={formatPct(row["24_h"])}
            tone={(row["24_h"] ?? 0) >= 0 ? "emerald" : "rose"}
          />
          <StatCell
            label="7d"
            value={formatPct(row["7_d"])}
            tone={(row["7_d"] ?? 0) >= 0 ? "emerald" : "rose"}
          />
          <StatCell
            label="30d"
            value={formatPct(monthlyGain)}
            tone={monthlyGain >= 0 ? "emerald" : "rose"}
            sub={monthlyGain >= 0 ? "Momentum" : "Softening"}
          />
          <StatCell
            label="Mkt cap"
            value={`$${formatNum(row.market_cap, {
              notation: "compact",
              maximumFractionDigits: 2,
            })}`}
          />
        </div>
        <div className={classNames("hidden min-w-[120px] justify-end sm:flex", sparkTone)}>
          <Sparkline values={trendSample} />
        </div>
      </div>

      <div className={classNames("sm:hidden", sparkTone)}>
        <Sparkline values={trendSample} />
      </div>
    </button>
  );
}

export function DetailPanel({
  row,
  onClose,
}: {
  row: IndexRow;
  onClose: () => void;
}) {
  const { data, loading, error, refetch, rateLimit } = usePerformance(row.id, {
    refreshMs: 60_000,
  });

  const { series, windowRows } = useMemo(() => {
    if (!data)
      return {
        series: [] as { x: Date; y: number }[],
        windowRows: [] as PerfRow[],
      };
    const sorted = [...data].sort(
      (a, b) => +new Date(a.date) - +new Date(b.date)
    );
    const deduped = sorted.reduce<PerfRow[]>((acc, curr) => {
      if (!acc.length || acc[acc.length - 1].date !== curr.date) acc.push(curr);
      return acc;
    }, []);
    const windowRows = deduped.slice(-30);
    const series = windowRows.map((entry) => ({
      x: new Date(entry.date),
      y: entry.index_cumulative_roi,
    }));
    return { series, windowRows };
  }, [data]);

  const latest = series.length ? series[series.length - 1].y : null;
  const earliest = series.length ? series[0].y : null;
  const delta = latest !== null && earliest !== null ? latest - earliest : null;

  const roiValues = series.map((point) => point.y);
  const roiHigh = roiValues.length ? Math.max(...roiValues) : null;
  const roiLow = roiValues.length ? Math.min(...roiValues) : null;
  const range = roiHigh !== null && roiLow !== null ? roiHigh - roiLow : null;

  const latestPerf = windowRows.at(-1);
  const avgVolume =
    windowRows.length > 0
      ? windowRows.reduce((acc, curr) => acc + (curr.volume || 0), 0) /
        windowRows.length
      : null;

  const monthlyGain = row["1_m"] ?? 0;
  const topIcons = row.top_gainers_icons
    ? Object.entries(row.top_gainers_icons).slice(0, 4)
    : [];

  const rateMinuteLimit = rateLimit?.minuteLimit ?? null;
  const rateMinuteRemaining = rateLimit?.minuteRemaining ?? null;
  const rateMinuteReset = rateLimit?.minuteReset
    ? new Date(rateLimit.minuteReset * 1000)
    : null;
  const rateMonthLimit = rateLimit?.monthLimit ?? null;
  const rateMonthRemaining = rateLimit?.monthRemaining ?? null;
  const rateMonthReset = rateLimit?.monthReset
    ? new Date(rateLimit.monthReset * 1000)
    : null;
  const rateMinuteExceeded =
    rateMinuteRemaining !== null && rateMinuteRemaining <= 0;
  const rateMonthExceeded =
    rateMonthRemaining !== null && rateMonthRemaining <= 0;
  const showRateLimitMeta = rateMinuteExceeded || rateMonthExceeded;

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
            30-day detail
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-50">
            {row.ticker}
          </div>
          <div className="text-sm text-slate-400">{row.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-emerald-glow/60 hover:text-emerald-glow"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-white/30"
          >
            Close
          </button>
        </div>
        {showRateLimitMeta && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
            {rateMinuteLimit !== null && rateMinuteExceeded && (
              <span>
                Minute {Math.max(rateMinuteRemaining ?? 0, 0)} remaining /{" "}
                {rateMinuteLimit}
                {rateMinuteReset
                  ? ` • resets ${rateMinuteReset.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}`
                  : ""}
              </span>
            )}
            {rateMonthLimit !== null && rateMonthExceeded && (
              <span>
                Monthly {Math.max(rateMonthRemaining ?? 0, 0)} remaining /{" "}
                {rateMonthLimit}
                {rateMonthReset
                  ? ` • resets ${rateMonthReset.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })} ${rateMonthReset.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-night-900/60 p-3">
          <StatCell
            label="Spot price"
            value={`$${formatNum(row.price, {
              maximumFractionDigits: 4,
            })}`}
            sub="Last cached"
            tone={monthlyGain >= 0 ? "emerald" : "rose"}
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-night-900/60 p-3">
          <StatCell
            label="Market cap"
            value={`$${formatNum(row.market_cap, {
              notation: "compact",
              maximumFractionDigits: 2,
            })}`}
            sub="Token Metrics snapshot"
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-night-900/60 p-3">
          <StatCell
            label="Index grade"
            value={formatNum(row.index_grade, {
              maximumFractionDigits: 1,
            })}
            sub="Fundamental score"
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-night-900/60 p-3">
          <StatCell
            label="Constituent coins"
            value={formatNum(row.coins)}
            sub="Tokens in basket"
          />
        </div>
      </div>

      {topIcons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Top components
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {topIcons.map(([key, token]) => {
              const iconSrc = token.small || token.thumb || token.large;
              return (
                <div key={key} className="flex items-center gap-2">
                  <img
                    src={iconSrc}
                    alt={token.name}
                    className="h-7 w-7 rounded-full border border-white/10 object-cover shadow-sm"
                  />
                  <span className="text-[11px] text-slate-400">
                    {token.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 rounded-3xl border border-white/10 bg-night-900/60 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading performance…
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-glow/40 bg-rose-glow/10 p-4 text-sm text-rose-100">
            <div className="font-semibold uppercase tracking-wide">Request issue</div>
            <div className="mt-1 text-rose-100/90">{error}</div>
            {rateMinuteLimit !== null && rateMinuteExceeded && (
              <div className="mt-2 text-[11px] uppercase tracking-wide text-rose-100/80">
                Minute {Math.max(rateMinuteRemaining ?? 0, 0)} remaining /{" "}
                {rateMinuteLimit}
                {rateMinuteReset
                  ? ` • resets ${rateMinuteReset.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}`
                  : ""}
              </div>
            )}
            {rateMonthLimit !== null && rateMonthExceeded && (
              <div className="text-[11px] uppercase tracking-wide text-rose-100/80">
                Monthly {Math.max(rateMonthRemaining ?? 0, 0)} remaining /{" "}
                {rateMonthLimit}
                {rateMonthReset
                  ? ` • resets ${rateMonthReset.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })} ${rateMonthReset.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </div>
            )}
          </div>
        )}
        {!loading && !error && series.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No 30-day performance data available yet.
          </div>
        )}
        {series.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <LineChart series={series} height={220} />
            </div>
            <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="30d change"
                  value={
                    delta !== null
                      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`
                      : "—"
                  }
                  tone={delta !== null && delta >= 0 ? "emerald" : "rose"}
                  sub={
                    earliest !== null && latest !== null
                      ? `${earliest.toFixed(2)}% → ${latest.toFixed(2)}%`
                      : undefined
                  }
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="ROI high"
                  value={roiHigh !== null ? `${roiHigh.toFixed(2)}%` : "—"}
                  sub="30d peak"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="ROI low"
                  value={roiLow !== null ? `${roiLow.toFixed(2)}%` : "—"}
                  sub="30d trough"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="Range"
                  value={range !== null ? `${range.toFixed(2)} pts` : "—"}
                  sub="High − low"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="Avg volume"
                  value={
                    avgVolume !== null
                      ? `$${formatNum(avgVolume, {
                          notation: "compact",
                          maximumFractionDigits: 2,
                        })}`
                      : "—"
                  }
                  sub="Across 30d window"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <StatCell
                  label="Samples"
                  value={formatNum(series.length)}
                  sub="Data points"
                />
              </div>
            </div>
            {latestPerf && (
              <div className="mt-4 text-[11px] uppercase tracking-wide text-slate-500">
                Last update: {new Date(latestPerf.date).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

