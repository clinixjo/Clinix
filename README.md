# Beauty Clinics System

Multi-tenant SaaS for beauty clinics (Jordan) — patient CRM, appointments, sales, and treatment-lifecycle retargeting. Bilingual Arabic/English with full RTL/LTR.

Planning docs (authoritative, Arabic) live in [docs/](docs/). Milestone roadmap: `docs/خطة-التنفيذ-الكاملة-عيادات-التجميل.md`.

## Stack

Next.js (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui · Supabase (Postgres + Auth + RLS) · next-intl

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** (choose the region closest to Jordan, typically EU).

3. **Apply migrations** — either:
   - Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - paste the files in `supabase/migrations/` (in order) into the Supabase SQL editor.

4. **Environment** — copy `.env.example` to `.env.local` and fill in the URL, anon key, and service role key from Project Settings → API.

5. **Verify tenant isolation (required before any feature work):**

   ```bash
   npm run test:isolation
   ```

   All tests must pass. They create two throwaway clinics, verify cross-clinic access is impossible on every table, check medical-note role restrictions and the `practitioner_can_edit` setting, then clean up.

6. **Seed a demo clinic + owner and start the app:**

   ```bash
   npm run seed:dev
   npm run dev
   ```

   Sign in at `http://localhost:3000/ar/login` with the credentials the seed script prints.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | All tests |
| `npm run test:isolation` | Tenant isolation test (needs `.env.local`) |
| `npm run seed:dev` | Create demo clinic + owner (needs `.env.local`) |

## Structure

- `supabase/migrations/` — schema + RLS policies (tenant isolation lives here)
- `src/app/[locale]/` — routes (ar/en); `(app)/` group is auth-guarded
- `src/i18n/` + `messages/` — next-intl config and translations (no hardcoded UI strings)
- `src/lib/supabase/` — browser/server clients + session proxy helper
- `src/components/` — shared components (design system); `ui/` is shadcn
- `tests/` — tenant isolation test
