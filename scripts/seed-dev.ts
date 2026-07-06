/**
 * Dev seeding — creates a demo clinic and an owner account so you can
 * sign in locally. Requires .env.local with the service role key.
 *
 *   npm run seed:dev
 *   npm run seed:dev -- --email you@example.com --password "S3cret!"
 *
 * Safe to re-run: reuses the clinic slug and the auth user if present.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const email = arg("email", "owner@demo-clinic.test");
const password = arg("password", "demo-Passw0rd!");
const clinicName = arg("clinic", "عيادة الوردة — Demo Clinic");
const slug = arg("slug", "demo-clinic");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Clinic (idempotent by slug)
  let { data: clinic } = await admin
    .from("clinics")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!clinic) {
    const { data, error } = await admin
      .from("clinics")
      .insert({ name: clinicName, slug })
      .select("id, name")
      .single();
    if (error) throw new Error(`clinic: ${error.message}`);
    clinic = data;
    console.log(`✓ Created clinic "${clinic.name}" (${clinic.id})`);
  } else {
    console.log(`• Clinic "${clinic.name}" already exists`);
  }

  // Auth user (idempotent by email)
  let userId: string;
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError) {
    if (!/already/i.test(createError.message)) {
      throw new Error(`auth user: ${createError.message}`);
    }
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) {
      throw new Error(
        `auth user ${email} exists but has no staff profile — remove it in Supabase or use another email`
      );
    }
    console.log(`• User ${email} already exists`);
    userId = existing.id;
  } else {
    userId = created.user.id;
    console.log(`✓ Created auth user ${email}`);
  }

  // Staff profile
  const { error: profileError } = await admin.from("users").upsert({
    id: userId,
    clinic_id: clinic.id,
    role: "owner",
    name: "Owner",
    email,
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  console.log("✓ Owner profile ready");
  console.log(`\nSign in at /ar/login with:\n  ${email}\n  ${password}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
