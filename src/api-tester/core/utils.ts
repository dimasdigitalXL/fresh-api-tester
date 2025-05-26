// src/api-tester/core/utils.ts

import { resolve } from "https://deno.land/std@0.216.0/path/mod.ts";

/**
 * Löst einen Pfad relativ zum Projekt-Root (Deno.cwd()) auf.
 *
 * Beispiele:
 *   resolveProjectPath("config.json")
 *     => /Users/.../mein-projekt/config.json
 *
 *   resolveProjectPath("src", "api-tester", "expected", "Foo.json")
 *     => /Users/.../mein-projekt/src/api-tester/expected/Foo.json
 */
export function resolveProjectPath(...segments: string[]): string {
  return resolve(Deno.cwd(), ...segments);
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
 *
 * Beispiel:
 *   safeReplace("Hello ${NAME}", { NAME: "Max" })  // "Hello Max"
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
