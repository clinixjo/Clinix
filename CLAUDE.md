# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project State

**M0 (foundation) built; awaiting Supabase project connection + isolation test pass before M1.** Three Arabic planning documents in `docs/` are the authoritative blueprint. Read the relevant one(s) before building anything:

- `docs/خطة-نظام-عيادات-التجميل.md` — Planning doc: vision, MVP scope, roles & permissions, data model, multi-tenancy, tech stack, legal compliance (Jordanian Data Protection Law No. 24 of 2023).
- `docs/خطة-التنفيذ-الكاملة-عيادات-التجميل.md` — Master roadmap: milestones M0–M10, each with tasks and a Definition of Done.
- `docs/نظام-التصميم-عيادات-التجميل.md` — Design system: color tokens, typography, spacing, components, RTL/LTR rules.

## What Is Being Built

A **multi-tenant SaaS** sold by subscription to beauty clinics in Jordan. It solves three problems: no organized patient base, manual/Excel appointment booking, and no sales tracking. The core differentiator is **treatment-lifecycle retargeting**: each service has a recommended follow-up interval (e.g., filler → 9 months), the system computes each patient's next follow-up date, and staff get a daily "due for contact" list that generates a personalized WhatsApp message via `wa.me` link (manual send in MVP; WhatsApp API is post-MVP). Every message is recorded in `message_log`.

## Locked Tech Stack (decided — do not re-litigate)

- **Next.js (App Router) + TypeScript**, deployed on Vercel, configured as a PWA
- **Tailwind CSS + shadcn/ui**
- **Supabase (managed)**: Postgres + Auth + Row Level Security + storage
- **next-intl** for Arabic/English
- **Recharts** for reports

## Non-Negotiable Architecture Rules

1. **Multi-tenancy first (M0).** Shared database; every table except `clinics` carries `clinic_id`; isolation enforced by **RLS policies** so no clinic can ever read/write another clinic's data even if the UI has bugs. Tenant isolation must be built and covered by an explicit isolation test **before any feature work begins**. Do not start M1 until the M0 Definition of Done passes.
2. **Medical notes are restricted.** `medical_notes` on patients/visits must be limited at the RLS level to practitioner and owner roles — not visible to receptionists.
3. **Roles:** owner / admin / receptionist / practitioner. Practitioner permissions are **per-clinic configurable** via the `practitioner_can_edit` setting in `clinics.settings` — the permission system reads clinic settings, it is not static. Build this in from the start.
4. **Bilingual ar/en with full RTL/LTR.** All UI text lives in translation files — never hardcode strings. Use only Tailwind logical properties (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`), never `pl-`/`pr-`/`left-`/`right-`. `dir` switches on the root with the locale. Format dates/numbers/currency (Jordanian Dinar) via `Intl`. Every screen must be tested in both directions before it's considered done.
5. **Compliance (Jordanian data protection law — health data is "sensitive").** Digital consent form with timestamp + consent version recorded at patient creation (data is processed outside Jordan on managed Supabase, requiring explicit consent). Audit log for sensitive operations. Per-patient data export and deletion must be supported (M8).

## Data Model

Tables: `clinics`, `users`, `patients`, `services`, `appointments`, `visits`, `sales`, `sale_items`, `patient_packages`, `message_log`, `followups`. Key mechanics:

- Completing an appointment automatically creates a `visits` record on the patient's file.
- `services.followup_interval_days` + last visit date (or the next package session) drive the `followups` due list — the retargeting engine.
- `patient_packages` tracks total vs. used sessions; a sale of a package session decrements the counter.
- `sale_items` records the performing practitioner (groundwork for future commissions).

Full column lists are in section ٦ of the planning doc.

## Workflow Rules

- Work **one milestone at a time** in order (M0 → M10 in the roadmap doc); meet each milestone's Definition of Done before moving on.
- Build each module completely before starting the next (patients fully, then services, then appointments…).
- Strict MVP scope: WhatsApp API automation, before/after photos, inventory, commissions, online booking, e-payment, and subscription billing automation are all **deferred** — do not build them now.
- Small, frequent commits.

## Design System Quick Reference

Full details in the design system doc; the essentials:

- **Primary color:** rose/mauve `#D4537E`, used sparingly (primary button, active tab) — never large backgrounds.
- **Warm neutrals:** page bg `#FAF9F7`, cards `#FFFFFF`, border `#EAE7E1`.
- **Fonts:** IBM Plex Sans Arabic / IBM Plex Sans; western digits; nothing below 12px.
- **Radius:** 8px default, 12px cards; light shadows only.
- **Tablet-first**, touch targets ≥ 44px; responsive down to mobile and up to desktop (~1280px max content width).
- Appointment statuses use the semantic colors: scheduled=blue, confirmed=green, completed=gray, no-show=red, cancelled=muted red — always dark text of the same family on tinted backgrounds, plus text/icon (never color alone).
- Define all tokens once as CSS variables + in the Tailwind config — no scattered hex values.
- Build shared components once (Button, Card, Input, StatusBadge, MetricCard, Avatar, ListRow, AppShell) and reuse them.
- Icons: Tabler or Lucide (outline). Dark mode not required for MVP.

## Commands

- `npm run dev` — dev server; `npm run build` — production build; `npm run lint` — ESLint
- `npm test` — vitest; `npm run test:isolation` — tenant isolation test (needs `.env.local` with a real Supabase project; self-skips otherwise). **Must pass before feature milestones proceed.**
- `npm run seed:dev` — create demo clinic + owner for local sign-in

## Code Layout & Conventions

- `supabase/migrations/` — schema + RLS. Medical notes live in the separate `patient_medical_notes` table (RLS is row-level, not column-level — this is how the role restriction is actually enforced). RLS helpers: `current_clinic_id()`, `current_user_role()`, `can_edit_records()`, `practitioner_can_edit()`.
- `src/app/[locale]/` — all routes are locale-prefixed (`ar` default, `en`); `(app)/` route group is auth-guarded via `getProfile()` in its layout. `src/proxy.ts` (Next 16 proxy convention) chains next-intl routing + Supabase session refresh.
- `src/i18n/` + `messages/{ar,en}.json` — every UI string goes in both message files.
- `src/lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (session refresh). `src/lib/auth.ts` → `getProfile()` returns role + clinic (cached per request; returns null when Supabase env vars are absent so the app degrades to signed-out).
- `src/components/` — shared design-system components (`StatusBadge`, `MetricCard`, `UserAvatar`, `ListRow`, `AppShell`); `src/components/ui/` is shadcn (radix-nova preset, RTL enabled). Design tokens are CSS variables in `src/app/globals.css` (`brand-*`, semantic `success/warning/danger/info/neutral-status` with `-bg`/`-fg` pairs, `surface-*`).
