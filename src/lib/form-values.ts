/** What a form sent, as text, to put back in its fields when it comes back with errors. Next's own `$ACTION_…` fields are left out. */
export function fieldValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  return values;
}
