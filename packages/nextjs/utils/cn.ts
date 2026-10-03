export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
