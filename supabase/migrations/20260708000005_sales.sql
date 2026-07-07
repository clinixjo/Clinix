-- ============================================================
-- M4 — Sales & Invoicing (the revenue engine).
--
-- The sales / sale_items / patient_packages tables shipped in M0/M2.
-- This migration:
--   1. Adds sale_items.package_id so package sales are first-class in
--      reporting (LTV / by-service / by-practitioner breakdowns).
--   2. Tightens UPDATE on sales/sale_items to managers only
--      (receptionists create; owners/admins edit or delete).
--   3. Adds record_sale() — a single-transaction function that records
--      a sale + its items and atomically redeems package sessions.
-- ============================================================

alter table public.sale_items
  add column if not exists package_id uuid references public.packages (id) on delete set null;

create index if not exists sale_items_practitioner_idx
  on public.sale_items (clinic_id, practitioner_id);

-- ------------------------------------------------------------
-- RLS: receptionists create sales, only managers edit/delete them.
-- (M0 opened UPDATE to can_edit_records; narrow it to managers.)
-- ------------------------------------------------------------

drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (clinic_id = (select public.current_clinic_id()));

drop policy if exists sale_items_update on public.sale_items;
create policy sale_items_update on public.sale_items
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (clinic_id = (select public.current_clinic_id()));

-- ------------------------------------------------------------
-- record_sale() — atomic checkout.
--
-- p_items is a JSON array; each element is one of:
--   { "kind": "service",  "service_id", "practitioner_id", "quantity", "price" }
--   { "kind": "package",  "package_id", "price" }              -- buys a package
--   { "kind": "redeem",   "service_id", "practitioner_id",
--                          "quantity", "patient_package_id" }   -- uses a session
--
-- Total = sum(price * quantity) over paid lines (redeem lines are 0).
-- SECURITY INVOKER: every statement is still checked by RLS, so a
-- caller can only ever touch their own clinic's rows.
-- ------------------------------------------------------------

create or replace function public.record_sale(
  p_patient_id uuid,
  p_visit_id uuid,
  p_payment_method public.payment_method,
  p_status public.sale_status,
  p_sale_date date,
  p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic     uuid := public.current_clinic_id();
  v_sale_id    uuid;
  v_item       jsonb;
  v_kind       text;
  v_total      numeric(10, 2) := 0;
  v_qty        integer;
  v_price      numeric(10, 2);
  v_pkg        uuid;
  v_pp         uuid;
  v_remaining  integer;
  v_sessions   integer;
begin
  if v_clinic is null then
    raise exception 'no clinic context';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no line items';
  end if;

  -- Total from paid lines only.
  select coalesce(sum(
    case when (i->>'kind') in ('service', 'package')
      then (i->>'price')::numeric * coalesce((i->>'quantity')::int, 1)
      else 0 end
  ), 0)
  into v_total
  from jsonb_array_elements(p_items) i;

  insert into public.sales (
    clinic_id, patient_id, visit_id, sale_date, total, payment_method, status, created_by
  )
  values (
    v_clinic, p_patient_id, p_visit_id, coalesce(p_sale_date, current_date),
    v_total, p_payment_method, coalesce(p_status, 'paid'), auth.uid()
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_kind := v_item ->> 'kind';
    v_qty := coalesce((v_item ->> 'quantity')::int, 1);

    if v_kind = 'service' then
      v_price := (v_item ->> 'price')::numeric;
      insert into public.sale_items (clinic_id, sale_id, service_id, practitioner_id, price, quantity)
      values (v_clinic, v_sale_id,
              nullif(v_item ->> 'service_id', '')::uuid,
              nullif(v_item ->> 'practitioner_id', '')::uuid,
              v_price, v_qty);

    elsif v_kind = 'package' then
      v_pkg := nullif(v_item ->> 'package_id', '')::uuid;
      v_price := (v_item ->> 'price')::numeric;
      insert into public.sale_items (clinic_id, sale_id, package_id, price, quantity)
      values (v_clinic, v_sale_id, v_pkg, v_price, 1);

      -- Grant the patient a session pool for the bundle.
      select coalesce(sum(quantity), 0) into v_sessions
      from public.package_items where package_id = v_pkg;

      insert into public.patient_packages (
        clinic_id, patient_id, package_id, sale_id, total_sessions, used_sessions
      )
      values (v_clinic, p_patient_id, v_pkg, v_sale_id, greatest(v_sessions, 1), 0);

    elsif v_kind = 'redeem' then
      v_pp := nullif(v_item ->> 'patient_package_id', '')::uuid;
      insert into public.sale_items (clinic_id, sale_id, service_id, practitioner_id, price, quantity)
      values (v_clinic, v_sale_id,
              nullif(v_item ->> 'service_id', '')::uuid,
              nullif(v_item ->> 'practitioner_id', '')::uuid,
              0, v_qty);

      -- Lock the package row, verify remaining, then decrement.
      select (total_sessions - used_sessions) into v_remaining
      from public.patient_packages
      where id = v_pp and clinic_id = v_clinic
      for update;

      if v_remaining is null then
        raise exception 'package not found';
      end if;
      if v_remaining < v_qty then
        raise exception 'insufficient sessions: % remaining, % requested', v_remaining, v_qty;
      end if;

      update public.patient_packages
      set used_sessions = used_sessions + v_qty
      where id = v_pp;

    else
      raise exception 'unknown line kind: %', v_kind;
    end if;
  end loop;

  return v_sale_id;
end;
$$;

revoke all on function public.record_sale(uuid, uuid, public.payment_method, public.sale_status, date, jsonb) from public;
grant execute on function public.record_sale(uuid, uuid, public.payment_method, public.sale_status, date, jsonb) to authenticated;
