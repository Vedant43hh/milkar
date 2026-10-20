// Translation for code that also runs in the browser. Uses only the small shared dictionary
// (en-ui.ts); screens get everything else from the server, already translated.
import { enUi } from "./en-ui";
import { interpolate } from "./interpolate";

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type UiKey = Leaves<Widen<typeof enUi>>;

export function tu(key: UiKey, vars?: Record<string, string | number>): string {
  let node: unknown = enUi;
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  if (typeof node !== "string") throw new Error(`Missing translation: ${key}`);
  return interpolate(node, vars);
}
