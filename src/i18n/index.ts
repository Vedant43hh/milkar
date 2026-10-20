import { en } from "./en";
import { interpolate } from "./interpolate";

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Shape every locale dictionary must match (same keys as English, any string values). */
export type Messages = Widen<typeof en>;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export type Locale = "en";

const dictionaries: Record<Locale, Messages> = { en };

export { interpolate };

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let node: unknown = dictionaries[locale];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  if (typeof node !== "string") throw new Error(`Missing translation: ${key}`);
  return interpolate(node, vars);
}

/** The whole dictionary for the current locale, for passing a namespace to client components. */
export function messages(locale: Locale = "en"): Messages {
  return dictionaries[locale];
}

/**
 * English for now; becomes locale-aware when a second language is added. Server-side only:
 * client components use `tu` from ./ui or receive their text from the server.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate("en", key, vars);
}
