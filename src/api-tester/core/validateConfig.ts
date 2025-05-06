// src/api-tester/core/validateConfig.ts
import { existsSync } from "https://deno.land/std@0.177.0/fs/mod.ts";
import { resolveProjectPath } from "./utils.ts";

export interface EndpointConfig {
  name: string;
  bodyFile?: string;
  expectedStructure?: string;
}

/**
 * Validiert, ob alle in der config.json angegebenen Dateien tatsächlich existieren.
 * Gibt Warnungen für fehlende Dateien aus (z. B. request-Bodies oder expected-Strukturen).
 *
 * @param endpoints - Liste aller Endpunkte aus der config.json
 */
export function validateConfig(endpoints: EndpointConfig[]) {
  let hasWarnings = false;

  for (const ep of endpoints) {
    if (ep.bodyFile) {
      const bodyPath = resolveProjectPath(ep.bodyFile);
      if (!existsSync(bodyPath)) {
        console.warn(`⚠️ Warnung: Datei fehlt → ${ep.bodyFile} (${ep.name})`);
        hasWarnings = true;
      }
    }
    if (ep.expectedStructure) {
      const expectedPath = resolveProjectPath(ep.expectedStructure);
      if (!existsSync(expectedPath)) {
        console.warn(
          `⚠️ Warnung: Datei fehlt → ${ep.expectedStructure} (${ep.name})`,
        );
        hasWarnings = true;
      }
    }
  }

  if (!hasWarnings) {
    console.log("\n✅ Alle Referenzen in config.json vorhanden.\n");
  }
}
