"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-brand-800">{tCommon("appName")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {t(state.error)}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t("signingIn") : t("signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
