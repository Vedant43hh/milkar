import { en } from "./en";

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Shape every locale dictionary must match (same keys as English, any string values). */
export type Messages = Widen<typeof en>;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export type Locale = "en";

const dictionaries: Record<Locale, Messages> = { en };

/** Replaces {name} placeholders. Unknown placeholders are left as-is so gaps are visible. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let node: unknown = dictionaries[locale];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  if (typeof node !== "string") throw new Error(`Missing translation: ${key}`);
  return interpolate(node, vars);
}

/** English for now; becomes locale-aware when a second language is added. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate("en", key, vars);
}
