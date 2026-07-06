-- ============================================================
-- M0 — Core schema for the multi-tenant beauty clinics SaaS.
-- Every table except `clinics` carries `clinic_id` for tenant
-- isolation (enforced by RLS in the next migration).
-- ============================================================

create extension if not exists btree_gist;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------

create type public.user_role as enum ('owner', 'admin', 'receptionist', 'practitioner');

create type public.gender as enum ('female', 'male');

create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled');

create type public.sale_status as enum ('paid', 'partial', 'unpaid', 'refunded');

create type public.payment_method as enum ('cash', 'card', 'transfer', 'other');

create type public.followup_status as enum ('pending', 'contacted', 'booked', 'dismissed');

create type public.message_channel as enum ('whatsapp', 'sms', 'phone', 'other');

-- ------------------------------------------------------------
-- clinics — the tenant
-- ------------------------------------------------------------

create table public.clinics (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  -- settings.practitioner_can_edit: whether practitioners can record
  -- services/sales themselves or only view + add notes
  settings            jsonb not null default '{"practitioner_can_edit": false}',
  subscription_status text not null default 'trial'
                      check (subscription_status in ('trial', 'active', 'suspended', 'cancelled')),
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- users — staff profile, 1:1 with auth.users
-- ------------------------------------------------------------

create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  role       public.user_role not null,
  name       text not null,
  email      text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index users_clinic_id_idx on public.users (clinic_id);

-- ------------------------------------------------------------
-- patients — general notes only; medical notes live in
-- patient_medical_notes so RLS can restrict them by role
-- ------------------------------------------------------------

create table public.patients (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  name            text not null,
  dob             date,
  gender          public.gender,
  whatsapp        text,
  phone           text,
  email           text,
  source          text,
  notes           text,
  -- digital consent (Jordanian data protection law): when + which wording
  consent_at      timestamptz,
  consent_version text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index patients_clinic_id_idx on public.patients (clinic_id);
create index patients_clinic_name_idx on public.patients (clinic_id, name);
create index patients_clinic_phone_idx on public.patients (clinic_id, phone);

-- ------------------------------------------------------------
-- patient_medical_notes — restricted to practitioner/owner via RLS
-- ------------------------------------------------------------

create table public.patient_medical_notes (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  visit_id   uuid, -- fk added after visits is created
  author_id  uuid references public.users (id) on delete set null,
  note       text not null,
  created_at timestamptz not null default now()
);

create index patient_medical_notes_clinic_id_idx on public.patient_medical_notes (clinic_id);
create index patient_medical_notes_patient_id_idx on public.patient_medical_notes (patient_id);

-- ------------------------------------------------------------
-- services — catalog; followup_interval_days drives retargeting
-- ------------------------------------------------------------

create table public.services (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references public.clinics (id) on delete cascade,
  name                   text not null,
  category               text,
  price                  numeric(10, 2) not null default 0 check (price >= 0),
  duration_min           integer check (duration_min > 0),
  is_package             boolean not null default false,
  sessions_count         integer check (sessions_count > 0),
  followup_interval_days integer check (followup_interval_days > 0),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint package_has_sessions check (not is_package or sessions_count is not null)
);

create index services_clinic_id_idx on public.services (clinic_id);

-- ------------------------------------------------------------
-- appointments — no double-booking per practitioner (DB-enforced)
-- ------------------------------------------------------------

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  practitioner_id uuid references public.users (id) on delete set null,
  service_id      uuid references public.services (id) on delete set null,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  status          public.appointment_status not null default 'scheduled',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint appointment_time_valid check (end_at > start_at),
  -- a practitioner cannot have two overlapping non-cancelled appointments
  constraint appointments_no_overlap exclude using gist (
    practitioner_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status not in ('cancelled', 'no_show'))
);

create index appointments_clinic_id_idx on public.appointments (clinic_id);
create index appointments_clinic_start_idx on public.appointments (clinic_id, start_at);
create index appointments_patient_id_idx on public.appointments (patient_id);

-- ------------------------------------------------------------
-- visits — the performed service; created when an appointment
-- is completed (or standalone for walk-ins)
-- ------------------------------------------------------------

create table public.visits (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  appointment_id  uuid references public.appointments (id) on delete set null,
  practitioner_id uuid references public.users (id) on delete set null,
  service_id      uuid references public.services (id) on delete set null,
  visit_date      date not null default current_date,
  notes           text,
  created_at      timestamptz not null default now()
);

create index visits_clinic_id_idx on public.visits (clinic_id);
create index visits_patient_id_idx on public.visits (patient_id);
create index visits_clinic_date_idx on public.visits (clinic_id, visit_date);

alter table public.patient_medical_notes
  add constraint patient_medical_notes_visit_id_fkey
  foreign key (visit_id) references public.visits (id) on delete set null;

-- ------------------------------------------------------------
-- sales + sale_items
-- ------------------------------------------------------------

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,
  visit_id       uuid references public.visits (id) on delete set null,
  sale_date      date not null default current_date,
  total          numeric(10, 2) not null default 0 check (total >= 0),
  payment_method public.payment_method,
  status         public.sale_status not null default 'paid',
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index sales_clinic_id_idx on public.sales (clinic_id);
create index sales_patient_id_idx on public.sales (patient_id);
create index sales_clinic_date_idx on public.sales (clinic_id, sale_date);

create table public.sale_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  sale_id         uuid not null references public.sales (id) on delete cascade,
  service_id      uuid references public.services (id) on delete set null,
  -- practitioner who performed it — groundwork for commissions
  practitioner_id uuid references public.users (id) on delete set null,
  price           numeric(10, 2) not null check (price >= 0),
  quantity        integer not null default 1 check (quantity > 0)
);

create index sale_items_clinic_id_idx on public.sale_items (clinic_id);
create index sale_items_sale_id_idx on public.sale_items (sale_id);

-- ------------------------------------------------------------
-- patient_packages — session counter per purchased package
-- ------------------------------------------------------------

create table public.patient_packages (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics (id) on delete cascade,
  patient_id     uuid not null references public.patients (id) on delete cascade,
  service_id     uuid not null references public.services (id) on delete cascade,
  sale_id        uuid references public.sales (id) on delete set null,
  total_sessions integer not null check (total_sessions > 0),
  used_sessions  integer not null default 0
                 check (used_sessions >= 0 and used_sessions <= total_sessions),
  purchased_at   date not null default current_date,
  created_at     timestamptz not null default now()
);

create index patient_packages_clinic_id_idx on public.patient_packages (clinic_id);
create index patient_packages_patient_id_idx on public.patient_packages (patient_id);

-- ------------------------------------------------------------
-- followups — the retargeting engine's due list
-- ------------------------------------------------------------

create table public.followups (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  service_id      uuid references public.services (id) on delete set null,
  source_visit_id uuid references public.visits (id) on delete set null,
  due_date        date not null,
  reason          text not null,
  status          public.followup_status not null default 'pending',
  created_at      timestamptz not null default now()
);

create index followups_clinic_id_idx on public.followups (clinic_id);
create index followups_clinic_due_idx on public.followups (clinic_id, status, due_date);

-- ------------------------------------------------------------
-- message_log — every outreach is recorded, even manual wa.me sends
-- ------------------------------------------------------------

create table public.message_log (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  followup_id uuid references public.followups (id) on delete set null,
  type        text not null,
  channel     public.message_channel not null default 'whatsapp',
  body        text,
  sent_by     uuid references public.users (id) on delete set null,
  sent_at     timestamptz not null default now()
);

create index message_log_clinic_id_idx on public.message_log (clinic_id);
create index message_log_patient_id_idx on public.message_log (patient_id);

-- ------------------------------------------------------------
-- audit_log — sensitive-operation trail (compliance)
-- ------------------------------------------------------------

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  user_id    uuid references public.users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  details    jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_clinic_id_idx on public.audit_log (clinic_id);

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sales
  for each row execute function public.set_updated_at();
