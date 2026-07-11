"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, UserPlus } from "lucide-react";
import { inviteStaff, type InviteRole } from "@/lib/actions/staff";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES: InviteRole[] = ["admin", "practitioner", "receptionist"];

export function InviteStaffDialog() {
  const t = useTranslations("staff");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRole("");
    setError(null);
    setCreds(null);
    setCopied(false);
  }

  function submit(formData: FormData) {
    setError(null);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    if (!role) {
      setError("invalid");
      return;
    }
    startTransition(async () => {
      const res = await inviteStaff({ name, email, role });
      if (res.ok) setCreds({ email: res.email, password: res.password });
      else setError(res.error);
    });
  }

  function copy() {
    if (!creds) return;
    navigator.clipboard
      .writeText(`${creds.email}\n${creds.password}`)
      .then(() => setCopied(true));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          {t("invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {creds ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("credentials.title")}</DialogTitle>
              <DialogDescription>{t("credentials.hint")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md bg-secondary p-3">
                <p className="text-xs text-muted-foreground">
                  {t("credentials.email")}
                </p>
                <p dir="ltr" className="font-medium">{creds.email}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("credentials.password")}
                </p>
                <p dir="ltr" className="font-mono font-medium">{creds.password}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t("credentials.copied") : t("credentials.copy")}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>
                {t("credentials.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("inviteDialog.title")}</DialogTitle>
            </DialogHeader>
            <form action={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">{t("inviteDialog.name")}</Label>
                <Input id="invite-name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t("inviteDialog.email")}</Label>
                <Input id="invite-email" name="email" type="email" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">{t("inviteDialog.role")}</Label>
                <Select value={role || undefined} onValueChange={(v) => setRole(v as InviteRole)}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue placeholder={t("inviteDialog.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-danger-fg">
                  {t(`inviteDialog.${error}`)}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? t("inviteDialog.creating") : t("inviteDialog.submit")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
