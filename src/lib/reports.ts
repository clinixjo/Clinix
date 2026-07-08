import { createClient } from "@/lib/supabase/server";
import { addDaysStr, todayDateStr } from "@/lib/datetime";

export type ReportPeriod = "30d" | "90d" | "12m";

export type DashboardStats = {
  revenue: { current: number; previous: number };
  trend: { month: string; revenue: number }[];
  patients: {
    new_patients: number;
    visitors_new: number;
    visitors_returning: number;
  };
  appointments: {
    completed: number;
    no_show: number;
    cancelled: number;
    total: number;
  };
  sources: { source: string; count: number }[];
  top_services: { name: string; revenue: number; volume: number }[];
  practitioners: { name: string; revenue: number; items: number }[];
  lifecycle: {
    pending: number;
    contacted: number;
    booked: number;
    dismissed: number;
    active_packages: number;
    outstanding_sessions: number;
    messages_sent: number;
  };
};

export function periodRange(period: ReportPeriod): { from: string; to: string } {
  const to = todayDateStr();
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return { from: addDaysStr(to, -(days - 1)), to };
}

export function isReportPeriod(v: string | undefined): v is ReportPeriod {
  return v === "30d" || v === "90d" || v === "12m";
}

/**
 * One round-trip for the whole dashboard. The RPC is SECURITY INVOKER
 * (RLS applies) and raises for non-managers — the page additionally
 * gates by role before ever calling this.
 */
export async function getDashboardStats(
  period: ReportPeriod
): Promise<DashboardStats> {
  const { from, to } = periodRange(period);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`get_dashboard_stats: ${error.message}`);
  return data as DashboardStats;
}
