import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Already signed in with a valid staff profile → go to the app.
  const profile = await getProfile();
  if (profile) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <LoginForm />
      </div>
    </div>
  );
}
