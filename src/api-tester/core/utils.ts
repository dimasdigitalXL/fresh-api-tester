// src/api-tester/core/utils.ts

import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.216.0/path/mod.ts";

/**
 * Löst einen Pfad relativ zum Projekt-Root auf.
 */
export function resolveProjectPath(...segments: string[]): string {
  const __dirname = dirname(fromFileUrl(import.meta.url));
  // springt nur EIN Level hoch: von core → src/api-tester
  return join(__dirname, "..", ...segments);
}

/**
 * Ersetzt `value` durch `fallback`, falls `value` undefined oder null ist.
 */
export function replaceWithFallback<T>(
  value: T | undefined | null,
  fallback: T,
): T {
  return value != null ? value : fallback;
}

/**
 * Führt in `template` Platzhalter vom Format `${KEY}` durch Werte aus `replacements` ein.
 * Wenn ein Key nicht gefunden wird, lässt er ihn leer stehen.
 */
export function safeReplace(
  template: string,
  replacements: Record<string, string>,
): string {
  return template.replace(
    /\$\{([^}]+)\}/g,
    (_match, key) => replacements[key] ?? "",
  );
}
