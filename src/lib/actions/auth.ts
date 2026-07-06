"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: "invalidCredentials" } | null;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "invalidCredentials" };
  }

  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect(`/${locale}/login`);
}
