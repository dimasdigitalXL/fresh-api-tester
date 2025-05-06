// src/api-tester/core/utils.ts

import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.177.0/path/mod.ts";

/**
 * Ersetzt sicher ein Muster in einem String, wenn der Eingabewert gültig ist.
 * Gibt eine Warnung aus, wenn der Eingabewert nicht vorhanden oder kein String ist.
 *
 * @param value - Der ursprüngliche String, in dem ersetzt werden soll
 * @param search - Das zu ersetzende Muster (String oder RegExp)
 * @param replaceValue - Der Ersatzstring
 * @returns Der resultierende String nach dem Ersetzen oder unverändert
 */
export function safeReplace(
  value: unknown,
  search: string | RegExp,
  replaceValue: string,
): string {
  if (typeof value === "string") {
    return value.replace(search, replaceValue);
  }
  console.warn(
    `⚠️ Warnung: Der Wert zum Ersetzen ist nicht verfügbar oder ungültig: ${value}`,
  );
  return typeof value === "string" ? value : "";
}

/**
 * Ähnlich wie `safeReplace`, aber mit zusätzlichem Fallback:
 * Wenn der ursprüngliche Wert nicht gesetzt ist, wird ein leerer String zurückgegeben.
 *
 * @param value - Der ursprüngliche String
 * @param placeholder - Der Platzhalter, der ersetzt werden soll
 * @param replacement - Der Ersatzstring
 * @returns Ersetzter String oder leerer Fallback
 */
export function replaceWithFallback(
  value: unknown,
  placeholder: string | RegExp,
  replacement: string,
): string {
  if (typeof value === "string") {
    return value.replace(placeholder, replacement);
  }
  console.warn(
    `⚠️ Warnung: Ersetzen von undefined oder ungültigem Wert bei: ${value}`,
  );
  return typeof value === "string" ? value : "";
}

/**
 * Baut einen absoluten Pfad relativ zum Projekt-Root.
 *
 * Beispiel:
 *   resolveProjectPath("expected", "Get_View_Customer.json")
 * → /Users/.../api-tester/expected/Get_View_Customer.json
 *
 * @param segments - Beliebig viele Pfadsegmente
 * @returns Absoluter Pfad vom Projekt-Wurzelverzeichnis aus
 */
export function resolveProjectPath(...segments: string[]): string {
  // __dirname-Äquivalent in Deno
  const __dirname = dirname(fromFileUrl(import.meta.url));
  // zwei Ebenen hoch (core/ → api-tester/ → Projekt-Root), dann die Segmente anhängen
  return join(__dirname, "..", "..", ...segments);
}
