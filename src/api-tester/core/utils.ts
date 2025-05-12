// src/api-tester/core/utils.ts
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";

/**
 * Baut aus dem Projekt-Root (Deno.cwd()) einen absoluten Pfad
 * zum src/api-tester Verzeichnis und hängt die übergebenen Segmente an.
 *
 * Beispiel:
 *   resolveProjectPath("config.json")
 * → <repo>/src/api-tester/config.json
 *
 *   resolveProjectPath("expected","Get_View_Product.json")
 * → <repo>/src/api-tester/expected/Get_View_Product.json
 */
export function resolveProjectPath(...segments: string[]): string {
  return join(Deno.cwd(), "src", "api-tester", ...segments);
}
