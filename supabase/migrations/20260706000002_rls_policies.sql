-- ============================================================
-- M0 — Row Level Security: tenant isolation + role rules.
--
-- Principles:
--  * Every policy scopes rows to the caller's clinic. A user from
--    clinic A can never read or write clinic B data, even if the
--    application layer has bugs.
--  * Medical notes are readable/writable only by practitioner/owner.
--  * Practitioner write access to records depends on the per-clinic
--    setting `settings.practitioner_can_edit`.
--  * Clinic + user provisioning happens via service role (onboarding
--    flow), not from the browser.
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions (security definer so they can read public.users
-- regardless of RLS; inactive users resolve to NULL => no access)
-- ------------------------------------------------------------

create function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id
  from public.users
  where id = (select auth.uid()) and is_active
$$;

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = (select auth.uid()) and is_active
$$;

-- owner/admin: clinic management powers
create function public.is_clinic_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('owner', 'admin')
$$;

-- true when the clinic lets practitioners record services/sales
create function public.practitioner_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((settings ->> 'practitioner_can_edit')::boolean, false)
  from public.clinics
  where id = public.current_clinic_id()
$$;

-- owner/admin/receptionist always; practitioner only when the
-- clinic's practitioner_can_edit setting allows it
create function public.can_edit_records()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('owner', 'admin', 'receptionist')
      or (public.current_user_role() = 'practitioner' and public.practitioner_can_edit())
$$;

-- medical notes: practitioner + owner only (not admin/receptionist)
create function public.can_access_medical_notes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('owner', 'practitioner')
$$;

-- ------------------------------------------------------------
-- Enable RLS everywhere (no policy = no access by default)
-- ------------------------------------------------------------

alter table public.clinics enable row level security;
alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.patient_medical_notes enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.visits enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.patient_packages enable row level security;
alter table public.followups enable row level security;
alter table public.message_log enable row level security;
alter table public.audit_log enable row level security;

-- ------------------------------------------------------------
-- clinics — members see their own clinic; only owner updates it;
-- creation/deletion is service-role only (onboarding)
-- ------------------------------------------------------------

create policy clinics_select on public.clinics
  for select to authenticated
  using (id = (select public.current_clinic_id()));

create policy clinics_update on public.clinics
  for update to authenticated
  using (id = (select public.current_clinic_id())
         and (select public.current_user_role()) = 'owner')
  with check (id = (select public.current_clinic_id()));

-- ------------------------------------------------------------
-- users — staff see colleagues; owner/admin manage staff
-- ------------------------------------------------------------

create policy users_select on public.users
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy users_insert on public.users
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.is_clinic_manager())
              and role <> 'owner');

create policy users_update on public.users
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (clinic_id = (select public.current_clinic_id()));

-- ------------------------------------------------------------
-- patients — all active staff work with patients;
-- deletion (data rights) is owner/admin only
-- ------------------------------------------------------------

create policy patients_select on public.patients
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy patients_insert on public.patients
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()));

create policy patients_update on public.patients
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy patients_delete on public.patients
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- patient_medical_notes — practitioner/owner only, all operations
-- ------------------------------------------------------------

create policy medical_notes_select on public.patient_medical_notes
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_access_medical_notes()));

create policy medical_notes_insert on public.patient_medical_notes
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.can_access_medical_notes()));

create policy medical_notes_update on public.patient_medical_notes
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_access_medical_notes()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy medical_notes_delete on public.patient_medical_notes
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_access_medical_notes()));

-- ------------------------------------------------------------
-- services — everyone reads the catalog; managers write
-- (practitioner too when the clinic allows it)
-- ------------------------------------------------------------

create policy services_select on public.services
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy services_insert on public.services
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and ((select public.is_clinic_manager())
                   or ((select public.current_user_role()) = 'practitioner'
                       and (select public.practitioner_can_edit()))));

create policy services_update on public.services
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and ((select public.is_clinic_manager())
              or ((select public.current_user_role()) = 'practitioner'
                  and (select public.practitioner_can_edit()))))
  with check (clinic_id = (select public.current_clinic_id()));

create policy services_delete on public.services
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- appointments — staff manage the calendar; practitioners can
-- always update their own appointments (status, notes)
-- ------------------------------------------------------------

create policy appointments_select on public.appointments
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.can_edit_records()));

create policy appointments_update on public.appointments
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and ((select public.can_edit_records())
              or practitioner_id = (select auth.uid())))
  with check (clinic_id = (select public.current_clinic_id()));

create policy appointments_delete on public.appointments
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- visits — visible to all staff (general record, no medical detail);
-- written by staff, practitioners for their own visits
-- ------------------------------------------------------------

create policy visits_select on public.visits
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy visits_insert on public.visits
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and ((select public.can_edit_records())
                   or practitioner_id = (select auth.uid())));

create policy visits_update on public.visits
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and ((select public.can_edit_records())
              or practitioner_id = (select auth.uid())))
  with check (clinic_id = (select public.current_clinic_id()));

create policy visits_delete on public.visits
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- sales / sale_items — financial data: owner/admin/receptionist
-- (practitioner included only when the clinic's setting allows)
-- ------------------------------------------------------------

create policy sales_select on public.sales
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_edit_records()));

create policy sales_insert on public.sales
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.can_edit_records()));

create policy sales_update on public.sales
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_edit_records()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy sales_delete on public.sales
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

create policy sale_items_select on public.sale_items
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_edit_records()));

create policy sale_items_insert on public.sale_items
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.can_edit_records()));

create policy sale_items_update on public.sale_items
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_edit_records()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy sale_items_delete on public.sale_items
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- patient_packages — all staff read (needed at booking time);
-- writes follow record-editing rules
-- ------------------------------------------------------------

create policy patient_packages_select on public.patient_packages
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy patient_packages_insert on public.patient_packages
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.can_edit_records()));

create policy patient_packages_update on public.patient_packages
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_edit_records()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy patient_packages_delete on public.patient_packages
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- followups — all staff read and work the due list
-- ------------------------------------------------------------

create policy followups_select on public.followups
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy followups_insert on public.followups
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()));

create policy followups_update on public.followups
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy followups_delete on public.followups
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- message_log — append-only outreach record: staff insert + read,
-- nobody updates or deletes from the app
-- ------------------------------------------------------------

create policy message_log_select on public.message_log
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy message_log_insert on public.message_log
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()));

-- ------------------------------------------------------------
-- audit_log — append-only: any staff action can be logged,
-- only owner/admin read it, never modified from the app
-- ------------------------------------------------------------

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()));
