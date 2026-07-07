"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { addMedicalNote, type MedicalNoteState } from "@/lib/actions/patients";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MedicalNoteForm({ patientId }: { patientId: string }) {
  const t = useTranslations("patients");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<MedicalNoteState, FormData>(
    async (prev, formData) => {
      const result = await addMedicalNote(patientId, prev, formData);
      return result;
    },
    null
  );

  // Clear the textarea after a successful submit.
  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Textarea
        name="note"
        rows={2}
        required
        placeholder={t("profile.addNotePlaceholder")}
        aria-label={t("profile.addNotePlaceholder")}
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {t("form.saveFailed")}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {t("profile.addNote")}
      </Button>
    </form>
  );
}
