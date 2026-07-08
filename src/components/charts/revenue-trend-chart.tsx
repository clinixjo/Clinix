"use client";

import { useLocale } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/chart-colors";
import { formatCurrency } from "@/lib/format";

type Point = { month: string; revenue: number };

/** "2026-06" → localized short month label. */
function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function TrendTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">
        {new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${p.month}-01T00:00:00Z`))}
      </p>
      <p dir="ltr" className="font-medium tabular-nums">
        {formatCurrency(Number(p.revenue), locale)}
      </p>
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: Point[] }) {
  const locale = useLocale();

  return (
    // Numeric time axis reads LTR in both locales; labels are localized.
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, left: 4, right: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.rose} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.rose} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => monthLabel(m, locale)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.inkMuted, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            width={44}
            tickCount={4}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.inkMuted, fontSize: 11 }}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat(locale, {
                notation: "compact",
                numberingSystem: "latn",
              }).format(v)
            }
          />
          <Tooltip
            content={<TrendTooltip locale={locale} />}
            cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={CHART.rose}
            strokeWidth={2}
            fill="url(#revenueFill)"
            activeDot={{ r: 4, fill: CHART.rose, stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
