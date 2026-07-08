import { createClient } from "@/lib/supabase/server";
import { addDaysStr, todayDateStr } from "@/lib/datetime";

export type DashboardCounts = {
  todayAppointments: number;
  dueFollowups: number;
  newPatientsThisMonth: number;
  /** null when the caller's role cannot see financials */
  monthRevenue: number | null;
};

/**
 * Lightweight head-count queries for the home dashboard (all roles).
 * Revenue is only fetched when the role can read sales — RLS would
 * return empty anyway, but we don't render a misleading 0.
 */
export async function getDashboardCounts(
  includeRevenue: boolean
): Promise<DashboardCounts> {
  const supabase = await createClient();
  const today = todayDateStr();
  const tomorrow = addDaysStr(today, 1);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [appts, followups, patients, sales] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("start_at", `${today}T00:00:00Z`)
      .lt("start_at", `${tomorrow}T00:00:00Z`)
      .neq("status", "cancelled"),
    supabase
      .from("followups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("due_date", today),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${monthStart}T00:00:00Z`),
    includeRevenue
      ? supabase
          .from("sales")
          .select("total")
          .gte("sale_date", monthStart)
          .neq("status", "refunded")
      : Promise.resolve({ data: null }),
  ]);

  const monthRevenue = includeRevenue
    ? (sales.data ?? []).reduce((sum, s) => sum + Number(s.total), 0)
    : null;

  return {
    todayAppointments: appts.count ?? 0,
    dueFollowups: followups.count ?? 0,
    newPatientsThisMonth: patients.count ?? 0,
    monthRevenue,
  };
}
