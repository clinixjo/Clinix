-- ============================================================
-- M7 — Settings & Clinic Onboarding (tenant self-management).
--
--  * clinics.logo_url          — brand mark shown in shell/invoice
--  * settings.onboarded        — drives the first-run wizard; existing
--                                clinics are backfilled to true
--  * clinics_update RLS        — widened from owner-only to managers
--                                (owner + admin) so admins edit settings
--  * clinic-logos bucket       — public read; writes go through a
--                                service-role action (no storage policies)
--
-- Staff invites and logo uploads run through server actions backed by
-- the service role, which derive clinic_id from the caller's session.
-- ============================================================

alter table public.clinics
  add column if not exists logo_url text;

-- Existing clinics already have data → treat them as onboarded.
update public.clinics
set settings = settings || '{"onboarded": true}'::jsonb
where not (settings ? 'onboarded');

-- Managers (owner + admin) may edit clinic settings, not just the owner.
drop policy if exists clinics_update on public.clinics;
create policy clinics_update on public.clinics
  for update to authenticated
  using (id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (id = (select public.current_clinic_id()));

-- Public bucket for clinic logos. Writes are performed by the
-- service-role upload action (which enforces manager + clinic scope),
-- so no storage.objects RLS policies are required here.
insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do nothing;
