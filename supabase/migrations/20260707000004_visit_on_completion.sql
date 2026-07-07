-- ============================================================
-- M3 — Appointments.
--
-- The `appointments` table, its no-double-booking exclusion
-- constraint, and RLS on appointments/visits all shipped in M0.
-- This migration adds the one piece of automation the planning
-- doc requires: completing an appointment records a visit on the
-- patient's file.
--
-- Implemented as a trigger (not app code) so the invariant holds
-- no matter which path flips the status. SECURITY DEFINER because
-- it only ever copies the appointment's own columns into a visit,
-- so it cannot leak across clinics.
-- ============================================================

create function public.create_visit_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only when transitioning INTO completed...
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- ...and only if this appointment hasn't already produced a visit.
    if not exists (
      select 1 from public.visits where appointment_id = new.id
    ) then
      insert into public.visits (
        clinic_id, patient_id, appointment_id,
        practitioner_id, service_id, visit_date
      )
      values (
        new.clinic_id, new.patient_id, new.id,
        new.practitioner_id, new.service_id, (new.start_at)::date
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger create_visit_on_completion
  after update of status on public.appointments
  for each row
  execute function public.create_visit_on_completion();
