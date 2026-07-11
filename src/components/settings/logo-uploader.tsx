"use client";

import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { uploadLogo } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

export function LogoUploader({
  clinicName,
  logoUrl,
}: {
  clinicName: string;
  logoUrl: string | null;
}) {
  const t = useTranslations("settings.clinic");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("logo", file);
    startTransition(async () => {
      const res = await uploadLogo(fd);
      if (res.ok) toast.success(t("save"));
      else toast.error(t("saveFailed"));
    });
  }

  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={clinicName}
          className="size-16 rounded-lg border border-border object-cover"
        />
      ) : (
        <UserAvatar name={clinicName} className="size-16 rounded-lg" />
      )}
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFile}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {logoUrl ? t("changeLogo") : t("uploadLogo")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
      </div>
    </div>
  );
}
