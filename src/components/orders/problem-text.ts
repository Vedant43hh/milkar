import { messages } from "@/i18n";
import type { ProblemText } from "./problem-form";

/** The problem form's words, for server components to hand to it. */
export function problemFormText(): ProblemText {
  const text = messages().problem;
  return { note: text.note, notePlaceholder: text.notePlaceholder, photo: text.photo, photoHint: text.photoHint, change: text.change, remove: text.remove, preview: text.preview, save: text.save, shrinking: text.shrinking };
}
