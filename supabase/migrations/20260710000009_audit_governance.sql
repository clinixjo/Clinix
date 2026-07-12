-- ============================================================
-- M8 — Audit, Compliance & Data Rights (the governance engine).
--
-- audit_log + its owner/admin-only, append-only RLS shipped in M0.
-- This migration:
--   * marks anonymized patients with purged_at
--   * auto-logs sensitive INSERT/UPDATE changes via SECURITY DEFINER
--     triggers (medical note added, staff activated/deactivated/role
--     changed, sale status changed). DELETE and app-level operations
--     are logged explicitly in their server actions — deliberately NOT
--     by triggers, so a clinic teardown's cascade deletes never try to
--     write audit rows referencing the clinic being removed.
--   * adds purge_patient(): right-to-erasure that anonymizes PII while
--     preserving financial records.
--
-- Audit details are PII-free (UUIDs / status / role only) so the trail
-- can never re-introduce what a purge erased.
-- ============================================================

alter table public.patients
  add column if not exists purged_at timestamptz;

-- ------------------------------------------------------------
-- Trigger: a medical note was added
-- ------------------------------------------------------------
create function public.audit_medical_note_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (clinic_id, user_id, action, entity, entity_id, details)
  values (new.clinic_id, auth.uid(), 'medical_note_added',
          'patient_medical_notes', new.id,
          jsonb_build_object('patient_id', new.patient_id));
  return new;
end;
$$;

create trigger audit_medical_note_added
  after insert on public.patient_medical_notes
  for each row execute function public.audit_medical_note_added();

-- ------------------------------------------------------------
-- Trigger: staff activated / deactivated / role changed
-- ------------------------------------------------------------
create function public.audit_user_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if old.is_active is distinct from new.is_active then
    v_action := case when new.is_active then 'staff_activated' else 'staff_deactivated' end;
  elsif old.role is distinct from new.role then
    v_action := 'staff_role_changed';
  else
    return new;
  end if;

  insert into public.audit_log (clinic_id, user_id, action, entity, entity_id, details)
  values (new.clinic_id, auth.uid(), v_action, 'users', new.id,
          jsonb_build_object('from_role', old.role, 'to_role', new.role,
                             'is_active', new.is_active));
  return new;
end;
$$;

create trigger audit_user_change
  after update of is_active, role on public.users
  for each row
  when (old.is_active is distinct from new.is_active
        or old.role is distinct from new.role)
  execute function public.audit_user_change();

-- ------------------------------------------------------------
-- Trigger: a sale's status changed (e.g. refund)
-- ------------------------------------------------------------
create function public.audit_sale_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (clinic_id, user_id, action, entity, entity_id, details)
  values (new.clinic_id, auth.uid(), 'sale_status_changed', 'sales', new.id,
          jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end;
$$;

create trigger audit_sale_status
  after update of status on public.sales
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_sale_status();

-- ------------------------------------------------------------
-- purge_patient() — anonymize PII, keep financial records.
--
-- SECURITY DEFINER so it can redact the append-only message_log;
-- guarded so only a manager of the patient's own clinic can run it.
-- ------------------------------------------------------------
create function public.purge_patient(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
begin
  if v_clinic is null or not public.is_clinic_manager() then
    raise exception 'purging patient data is available to clinic managers only';
  end if;
  if not exists (
    select 1 from public.patients
    where id = p_patient_id and clinic_id = v_clinic
  ) then
    raise exception 'patient not found';
  end if;

  -- Anonymize the patient's personal data (keep the row for
  -- referential integrity of visits/sales).
  update public.patients
  set name = '[purged]',
      dob = null,
      whatsapp = null,
      phone = null,
      email = null,
      notes = null,
      purged_at = now()
  where id = p_patient_id and clinic_id = v_clinic;

  -- Erase clinical free-text.
  delete from public.patient_medical_notes
  where patient_id = p_patient_id and clinic_id = v_clinic;

  -- Redact outreach message bodies (append-only otherwise).
  update public.message_log
  set body = '[purged]'
  where patient_id = p_patient_id and clinic_id = v_clinic;

  insert into public.audit_log (clinic_id, user_id, action, entity, entity_id)
  values (v_clinic, auth.uid(), 'patient_purged', 'patients', p_patient_id);
end;
$$;

revoke all on function public.purge_patient(uuid) from public;
grant execute on function public.purge_patient(uuid) to authenticated;
