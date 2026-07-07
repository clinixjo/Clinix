-- ============================================================
-- M5 — Retargeting & Follow-ups (the patient-care lifecycle engine).
--
-- The followups and message_log tables + their RLS shipped in M0.
-- This migration adds the retargeting engine: when a visit is
-- recorded for a service that has a recommended follow-up interval,
-- a follow-up is scheduled for (visit date + interval). Re-visiting
-- the same service supersedes the previous pending follow-up so the
-- clock always reflects the latest treatment.
--
-- Trigger-based (not app code) so the invariant holds for every
-- visit — whether from a completed appointment (M3 trigger) or a
-- manual walk-in. SECURITY DEFINER: it only ever copies the visit's
-- own columns, so it cannot cross clinics.
-- ============================================================

create function public.generate_service_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interval integer;
begin
  if new.service_id is null then
    return new;
  end if;

  select followup_interval_days into v_interval
  from public.services
  where id = new.service_id;

  -- No recommended interval → nothing to retarget on.
  if v_interval is null then
    return new;
  end if;

  -- A newer visit resets the cycle: retire any still-pending
  -- follow-up for this patient + service.
  update public.followups
  set status = 'dismissed'
  where clinic_id = new.clinic_id
    and patient_id = new.patient_id
    and service_id = new.service_id
    and status = 'pending';

  insert into public.followups (
    clinic_id, patient_id, service_id, source_visit_id,
    due_date, reason, status
  )
  values (
    new.clinic_id, new.patient_id, new.service_id, new.id,
    new.visit_date + (v_interval || ' days')::interval,
    'service', 'pending'
  );

  return new;
end;
$$;

create trigger generate_service_followup
  after insert on public.visits
  for each row
  execute function public.generate_service_followup();
