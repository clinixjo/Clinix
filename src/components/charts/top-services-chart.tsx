"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/chart-colors";
import { formatCurrency } from "@/lib/format";

type Row = { name: string; revenue: number; volume: number };

function ServiceTooltip({
  active,
  payload,
  locale,
  volumeLabel,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  locale: string;
  volumeLabel: (count: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{p.name}</p>
      <p dir="ltr" className="font-medium tabular-nums">
        {formatCurrency(Number(p.revenue), locale)}
      </p>
      <p className="text-xs text-muted-foreground">
        {volumeLabel(Number(p.volume))}
      </p>
    </div>
  );
}

export function TopServicesChart({ data }: { data: Row[] }) {
  const locale = useLocale();
  const t = useTranslations("reports.charts");
  const height = Math.max(120, data.length * 44);

  return (
    <div dir="ltr" style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, left: 4, right: 56, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.ink, fontSize: 12 }}
          />
          <Tooltip
            content={
              <ServiceTooltip
                locale={locale}
                volumeLabel={(count) => t("volumeShort", { count })}
              />
            }
            cursor={{ fill: CHART.grid, opacity: 0.35 }}
          />
          <Bar
            dataKey="revenue"
            fill={CHART.rose}
            barSize={16}
            radius={[0, 4, 4, 0]}
          >
            <LabelList
              dataKey="revenue"
              position="right"
              fill={CHART.inkMuted}
              fontSize={11}
              formatter={(v: unknown) =>
                new Intl.NumberFormat(locale, {
                  notation: "compact",
                  numberingSystem: "latn",
                }).format(Number(v))
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
