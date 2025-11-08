"use client";

import React, { useId } from "react";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  tooltipLabel?: string;
};

export function Sparkline({
  values,
  width = 120,
  height = 36,
  strokeWidth = 2,
  tooltipLabel,
}: SparklineProps) {
  const safeValues = values.length ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const span = max - min || 1;
  const pts = safeValues.map((v, i) => {
    const x =
      (i / Math.max(safeValues.length - 1, 1)) * (width - strokeWidth) +
      strokeWidth / 2;
    const y =
      height - ((v - min) / span) * (height - strokeWidth) - strokeWidth / 2;
    return `${x},${y}`;
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={tooltipLabel ?? "trend"}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.9}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
      />
    </svg>
  );
}

type LineChartProps = {
  series: { x: Date; y: number }[];
  width?: number;
  height?: number;
  yLabel?: string;
};

export function LineChart({
  series,
  width = 640,
  height = 180,
  yLabel = "Cumulative ROI (%)",
}: LineChartProps) {
  const chartId = useId();

  if (!series.length) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${yLabel} last 30 days`}>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          fontSize="12"
          fill="rgba(148, 163, 184, 0.8)"
        >
          No data
        </text>
      </svg>
    );
  }

  const strokeGradientId = `${chartId}-stroke`;
  const fillGradientId = `${chartId}-fill`;
  const trendUp =
    series.length >= 2 ? series[series.length - 1].y - series[0].y >= 0 : true;
  const strokeColor = trendUp ? "rgba(20, 241, 149, 1)" : "rgba(241, 91, 130, 1)";
  const fillColor = trendUp
    ? "rgba(20, 241, 149, 0.18)"
    : "rgba(241, 91, 130, 0.18)";

  const pad = { t: 12, r: 8, b: 22, l: 36 };
  const xs = series.map((p) => p.x.getTime());
  const ys = series.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const toX = (t: number) =>
    pad.l + ((t - minX) / spanX) * (width - pad.l - pad.r);
  const toY = (v: number) =>
    height - pad.b - ((v - minY) / spanY) * (height - pad.t - pad.b);

  const d = series
    .map((p, i) => `${i ? "L" : "M"} ${toX(p.x.getTime())} ${toY(p.y)}`)
    .join(" ");

  const areaPath = `${d} L ${toX(series[series.length - 1].x.getTime())} ${
    height - pad.b
  } L ${toX(series[0].x.getTime())} ${height - pad.b} Z`;

  const ticks = 4;
  const yTicks = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + (i * spanY) / ticks
  );

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`${yLabel} last 30 days`}
    >
      <defs>
        <linearGradient id={strokeGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.6} />
        </linearGradient>
        <linearGradient id={fillGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={fillColor} />
          <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {yTicks.map((yv, i) => {
        const y = toY(yv);
        return (
          <g key={i}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={pad.l - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="rgba(148, 163, 184, 0.9)"
            >
              {yv.toFixed(2)}
            </text>
          </g>
        );
      })}
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={height - pad.b}
        y2={height - pad.b}
        stroke="currentColor"
        strokeOpacity={0.15}
      />
      <text
        x={pad.l}
        y={10}
        fontSize="11"
        fontWeight={600}
        fill="rgba(226, 232, 240, 0.8)"
      >
        {yLabel}
      </text>
      <path d={areaPath} fill={`url(#${fillGradientId})`} opacity={0.8} />
      <path
        d={d}
        fill="none"
        stroke={`url(#${strokeGradientId})`}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

