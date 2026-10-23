"use client";

import { Camera, Trash2 } from "lucide-react";
import Image from "next/image";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action-result";
import { fitWithin, MAX_PHOTO_BYTES } from "@/lib/photos";
import { saveProblemAction } from "@/server/actions/orders";
import { Button } from "../ui/button";
import { Label, Textarea } from "../ui/form";
import { useToast } from "../ui/toast";

export type ProblemText = {
  note: string;
  notePlaceholder: string;
  photo: string;
  photoHint: string;
  change: string;
  remove: string;
  preview: string;
  save: string;
  shrinking: string;
};

type Shrunk = { blob: Blob; width: number; height: number; url: string };

/** Shrinks a photo to at most 1280 px and 300 KB as a JPEG, lowering the quality (then the size) until it fits. */
async function shrink(file: File): Promise<Shrunk | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return null;
  let { width, height } = fitWithin(bitmap.width, bitmap.height);
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        bitmap.close();
        return { blob, width, height, url: URL.createObjectURL(blob) };
      }
    }
    width = Math.max(1, Math.round(width * 0.75));
    height = Math.max(1, Math.round(height * 0.75));
  }
  bitmap.close();
  return null;
}

/** The note and an optional photo of what's wrong, saved together. */
export function ProblemForm({ roundId, note, photo, text }: { roundId: string; note: string; photo: { url: string; width: number; height: number } | null; text: ProblemText }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [shrunk, setShrunk] = useState<Shrunk | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, startShrink] = useTransition();
  const [, formAction, saving] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const result = await saveProblemAction(prev, formData);
    if (result.message) toast({ tone: result.ok ? "success" : "error", title: result.message });
    if (result.ok) {
      setShrunk(null);
      setRemoved(false);
    }
    return result;
  }, { ok: true });
  const [, submit] = useTransition();

  // Free the preview's memory when it's replaced or the form goes away.
  useEffect(() => {
    const url = shrunk?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shrunk]);

  function choose(file: File | undefined) {
    if (!file) return;
    startShrink(async () => {
      const result = await shrink(file);
      if (!result) toast({ tone: "error", title: text.photoHint });
      setShrunk(result);
      setRemoved(false);
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.delete("pick");
    if (shrunk) {
      data.set("photo", new File([shrunk.blob], "problem.jpg", { type: "image/jpeg" }));
      data.set("width", String(shrunk.width));
      data.set("height", String(shrunk.height));
    }
    if (removed) data.set("removePhoto", "1");
    submit(() => formAction(data));
  }

  const shown = shrunk ? { url: shrunk.url, width: shrunk.width, height: shrunk.height } : removed ? null : photo;
  const noteId = `problem-note-${roundId}`;
  const pickId = `problem-photo-${roundId}`;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="roundId" value={roundId} />
      <div>
        <Label htmlFor={noteId}>{text.note}</Label>
        <Textarea id={noteId} name="note" rows={3} maxLength={500} defaultValue={note} placeholder={text.notePlaceholder} />
      </div>
      <div className="space-y-2">
        {shown && (
          <Image src={shown.url} alt={text.preview} width={shown.width} height={shown.height} unoptimized className="max-h-48 w-auto rounded-control border border-border object-contain" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={pickId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-sm font-medium text-fg has-focus-visible:ring-2 has-focus-visible:ring-focus">
            <Camera aria-hidden className="size-4" />
            {busy ? text.shrinking : shown ? text.change : text.photo}
            <input ref={input} id={pickId} name="pick" type="file" accept="image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          {shown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Trash2 aria-hidden className="size-4" />}
              onClick={() => {
                setShrunk(null);
                setRemoved(true);
                if (input.current) input.current.value = "";
              }}
            >
              {text.remove}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">{text.photoHint}</p>
      </div>
      <Button loading={saving || busy}>{text.save}</Button>
    </form>
  );
}
