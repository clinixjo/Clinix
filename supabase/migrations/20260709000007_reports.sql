-- ============================================================
-- M6 — Reports & Dashboard (the executive brain).
--
-- One SECURITY INVOKER RPC returns the whole dashboard as a single
-- jsonb payload: one round-trip, aggregation happens in Postgres on
-- indexed columns, RLS applies to every statement, and an explicit
-- is_clinic_manager() guard raises for non-managers — receptionists
-- cannot read clinic revenue even by calling the function directly.
--
-- Materialized views were considered and deferred: they don't
-- support RLS, need refresh scheduling, and are unnecessary at
-- current per-clinic row counts. Revisit if clinics reach millions
-- of rows.
-- ============================================================

create index if not exists patients_clinic_created_idx
  on public.patients (clinic_id, created_at);

create or replace function public.get_dashboard_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic        uuid := public.current_clinic_id();
  v_len           integer := (p_to - p_from) + 1;
  v_prev_from     date := p_from - ((p_to - p_from) + 1);
  v_prev_to       date := p_from - 1;
  v_trend_from    date := (date_trunc('month', p_to::timestamptz) - interval '11 months')::date;
  v_revenue       numeric;
  v_prev_revenue  numeric;
  v_trend         jsonb;
  v_patients      jsonb;
  v_appointments  jsonb;
  v_sources       jsonb;
  v_services      jsonb;
  v_practitioners jsonb;
  v_lifecycle     jsonb;
begin
  if v_clinic is null or not public.is_clinic_manager() then
    raise exception 'reports are available to clinic managers only';
  end if;
  if v_len <= 0 then
    raise exception 'invalid period';
  end if;

  -- Revenue: current period + the equal-length period before it.
  select coalesce(sum(total), 0) into v_revenue
  from sales
  where clinic_id = v_clinic and status <> 'refunded'
    and sale_date between p_from and p_to;

  select coalesce(sum(total), 0) into v_prev_revenue
  from sales
  where clinic_id = v_clinic and status <> 'refunded'
    and sale_date between v_prev_from and v_prev_to;

  -- 12-month revenue trend ending at p_to's month (gaps filled with 0).
  select coalesce(
    jsonb_agg(jsonb_build_object('month', m.month, 'revenue', coalesce(s.rev, 0))
              order by m.month),
    '[]'::jsonb)
  into v_trend
  from (
    select to_char(d, 'YYYY-MM') as month
    from generate_series(v_trend_from::timestamptz,
                         date_trunc('month', p_to::timestamptz),
                         interval '1 month') d
  ) m
  left join (
    select to_char(date_trunc('month', sale_date::timestamptz), 'YYYY-MM') as month,
           sum(total) as rev
    from sales
    where clinic_id = v_clinic and status <> 'refunded'
      and sale_date >= v_trend_from
    group by 1
  ) s using (month);

  -- Retention: among patients who visited in the period, whose
  -- first-ever visit falls inside it (new) vs before it (returning).
  select jsonb_build_object(
    'new_patients',
      (select count(*) from patients
       where clinic_id = v_clinic
         and created_at::date between p_from and p_to),
    'visitors_new',
      coalesce(count(*) filter (where t.first_visit >= p_from), 0),
    'visitors_returning',
      coalesce(count(*) filter (where t.first_visit < p_from), 0)
  )
  into v_patients
  from (
    select patient_id, min(visit_date) as first_visit
    from visits
    where clinic_id = v_clinic
    group by patient_id
    having bool_or(visit_date between p_from and p_to)
  ) t;

  -- Appointment outcomes in the period.
  select jsonb_build_object(
    'completed', count(*) filter (where status = 'completed'),
    'no_show',   count(*) filter (where status = 'no_show'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'total',     count(*)
  )
  into v_appointments
  from appointments
  where clinic_id = v_clinic
    and start_at >= p_from and start_at < (p_to + 1);

  -- Acquisition channels: where new patients came from.
  select coalesce(
    jsonb_agg(jsonb_build_object('source', t.source, 'count', t.c)
              order by t.c desc),
    '[]'::jsonb)
  into v_sources
  from (
    select coalesce(source, 'unknown') as source, count(*) as c
    from patients
    where clinic_id = v_clinic
      and created_at::date between p_from and p_to
    group by 1
  ) t;

  -- Top services/packages by revenue (volume includes 0-price redeems —
  -- usage and revenue are different truths, both reported).
  select coalesce(
    jsonb_agg(jsonb_build_object('name', t.name, 'revenue', t.revenue, 'volume', t.volume)
              order by t.revenue desc, t.volume desc),
    '[]'::jsonb)
  into v_services
  from (
    select coalesce(sv.name, pk.name, '—') as name,
           sum(si.price * si.quantity) as revenue,
           sum(si.quantity) as volume
    from sale_items si
    join sales s on s.id = si.sale_id
    left join services sv on sv.id = si.service_id
    left join packages pk on pk.id = si.package_id
    where si.clinic_id = v_clinic
      and s.status <> 'refunded'
      and s.sale_date between p_from and p_to
    group by 1
    order by revenue desc, volume desc
    limit 6
  ) t;

  -- Practitioner performance (groundwork from sale_items.practitioner_id).
  select coalesce(
    jsonb_agg(jsonb_build_object('name', u.name, 'revenue', t.revenue, 'items', t.items)
              order by t.revenue desc),
    '[]'::jsonb)
  into v_practitioners
  from (
    select si.practitioner_id,
           sum(si.price * si.quantity) as revenue,
           sum(si.quantity) as items
    from sale_items si
    join sales s on s.id = si.sale_id
    where si.clinic_id = v_clinic
      and si.practitioner_id is not null
      and s.status <> 'refunded'
      and s.sale_date between p_from and p_to
    group by 1
  ) t
  join users u on u.id = t.practitioner_id;

  -- Treatment-lifecycle health: the follow-up funnel for follow-ups due
  -- in the period, plus package balances and outreach volume.
  select jsonb_build_object(
    'pending',   count(*) filter (where status = 'pending'),
    'contacted', count(*) filter (where status = 'contacted'),
    'booked',    count(*) filter (where status = 'booked'),
    'dismissed', count(*) filter (where status = 'dismissed'),
    'active_packages',
      (select count(*) from patient_packages pp
       where pp.clinic_id = v_clinic and pp.used_sessions < pp.total_sessions),
    'outstanding_sessions',
      (select coalesce(sum(pp.total_sessions - pp.used_sessions), 0)
       from patient_packages pp
       where pp.clinic_id = v_clinic and pp.used_sessions < pp.total_sessions),
    'messages_sent',
      (select count(*) from message_log ml
       where ml.clinic_id = v_clinic
         and ml.sent_at >= p_from and ml.sent_at < (p_to + 1))
  )
  into v_lifecycle
  from followups
  where clinic_id = v_clinic
    and due_date between p_from and p_to;

  return jsonb_build_object(
    'revenue', jsonb_build_object('current', v_revenue, 'previous', v_prev_revenue),
    'trend', v_trend,
    'patients', v_patients,
    'appointments', v_appointments,
    'sources', v_sources,
    'top_services', v_services,
    'practitioners', v_practitioners,
    'lifecycle', v_lifecycle
  );
end;
$$;

revoke all on function public.get_dashboard_stats(date, date) from public;
grant execute on function public.get_dashboard_stats(date, date) to authenticated;
