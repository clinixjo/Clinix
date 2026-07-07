-- ============================================================
-- M2 — Services & Packages catalog.
--
-- Services gain `description` and `tax_rate`. Packages become
-- first-class: a `packages` bundle references multiple services
-- via `package_items`, each with a quantity (e.g. 5 Botox + 1
-- HydraFacial). The single-service package flags on `services`
-- (is_package/sessions_count) are removed in favour of this model.
--
-- RLS: every new table is scoped to the caller's clinic_id.
-- Reads: any clinic member. Writes: owner/admin (managers) only —
-- receptionists and practitioners are view-only on the catalog.
-- ============================================================

-- ------------------------------------------------------------
-- services: add description + tax_rate; drop the old single-
-- service package flags (packages are now their own tables)
-- ------------------------------------------------------------

alter table public.services drop constraint if exists package_has_sessions;

alter table public.services
  add column if not exists description text,
  add column if not exists tax_rate numeric(5, 2) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100);

alter table public.services drop column if exists is_package;
alter table public.services drop column if exists sessions_count;

-- ------------------------------------------------------------
-- packages — a sellable bundle of services
--   price       = the package's selling price
--   total value = sum of member service prices × qty (computed)
-- ------------------------------------------------------------

create table public.packages (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  name        text not null,
  description text,
  price       numeric(10, 2) not null default 0 check (price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index packages_clinic_id_idx on public.packages (clinic_id);

create table public.package_items (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  package_id uuid not null references public.packages (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (package_id, service_id)
);

create index package_items_clinic_id_idx on public.package_items (clinic_id);
create index package_items_package_id_idx on public.package_items (package_id);

create trigger set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- patient_packages: a purchased package can now reference either
-- a single service (session pack) or a bundle package. Wiring the
-- decrement logic is M4; here we just make the shape forward-safe.
-- ------------------------------------------------------------

alter table public.patient_packages alter column service_id drop not null;
alter table public.patient_packages
  add column if not exists package_id uuid references public.packages (id) on delete set null;
alter table public.patient_packages
  add constraint patient_packages_target_present
  check (service_id is not null or package_id is not null);

-- ------------------------------------------------------------
-- RLS — packages
-- ------------------------------------------------------------

alter table public.packages enable row level security;

create policy packages_select on public.packages
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy packages_insert on public.packages
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.is_clinic_manager()));

create policy packages_update on public.packages
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy packages_delete on public.packages
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));

-- ------------------------------------------------------------
-- RLS — package_items (mirror packages; managers write)
-- ------------------------------------------------------------

alter table public.package_items enable row level security;

create policy package_items_select on public.package_items
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy package_items_insert on public.package_items
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.is_clinic_manager()));

create policy package_items_update on public.package_items
  for update to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()))
  with check (clinic_id = (select public.current_clinic_id()));

create policy package_items_delete on public.package_items
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.is_clinic_manager()));
