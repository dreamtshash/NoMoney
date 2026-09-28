"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompactCurrency, formatCurrency } from "@/lib/utils/format";

/**
 * Money charts. Every chart names its axes, uses ₹ on the value axis and in
 * tooltips, and shows a legend whenever there is more than one series.
 */

export interface MoneySeries {
  key: string;
  name: string;
  /** CSS colour, e.g. "hsl(var(--accent))". */
  color: string;
}

export interface MoneyDatum {
  /** Short tick label on the category/time axis. */
  label: string;
  /** Full label shown in the tooltip (e.g. "Mon, 5 Sep 2026"). Defaults to `label`. */
  tooltipLabel?: string;
  [seriesKey: string]: number | string | undefined;
}

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const AXIS_LABEL = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function MoneyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; payload: MoneyDatum }[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]!.payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{datum.tooltipLabel ?? datum.label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          {payload.length > 1 && <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden="true" />}
          <span className="text-muted-foreground">{p.name}</span>
          <span className="money ml-auto pl-3 font-semibold">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

interface MoneyChartProps {
  data: MoneyDatum[];
  series: MoneySeries[];
  kind: "bar" | "line";
  xLabel: string;
  yLabel?: string;
  height?: number;
  /** Accessible summary, read instead of the SVG. */
  summary: string;
}

/** Time or category on X, ₹ on Y. One or more series. */
export function MoneyChart({ data, series, kind, xLabel, yLabel = "Amount (₹)", height = 260, summary }: MoneyChartProps) {
  const Chart = kind === "bar" ? BarChart : LineChart;
  return (
    <figure>
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <Chart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={AXIS_TICK}
              interval="preserveStartEnd"
              minTickGap={8}
              label={{ value: xLabel, position: "insideBottom", offset: -12, style: AXIS_LABEL }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={62}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => formatCompactCurrency(v)}
              label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 0, style: { ...AXIS_LABEL, textAnchor: "middle" } }}
            />
            <Tooltip content={<MoneyTooltip />} cursor={kind === "bar" ? { fill: "hsl(var(--secondary))" } : { stroke: "hsl(var(--border))" }} />
            {series.length > 1 && (
              <Legend verticalAlign="top" align="right" height={28} iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            )}
            {series.map((s) =>
              kind === "bar" ? (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={36} />
              ) : (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Horizontal bars: category names on Y, ₹ on X. Readable for long category names. */
export function CategoryBarChart({
  data,
  color = "hsl(var(--accent))",
  valueName = "Spent",
  summary,
}: {
  data: { label: string; value: number }[];
  color?: string;
  valueName?: string;
  summary: string;
}) {
  const height = Math.max(120, data.length * 34 + 56);
  return (
    <figure>
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => formatCompactCurrency(v)}
              label={{ value: "Amount (₹)", position: "insideBottom", offset: -12, style: AXIS_LABEL }}
            />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={96} tick={{ ...AXIS_TICK, fontSize: 12 }} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "hsl(var(--secondary))" }} />
            <Bar dataKey="value" name={valueName} fill={color} radius={[0, 3, 3, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
