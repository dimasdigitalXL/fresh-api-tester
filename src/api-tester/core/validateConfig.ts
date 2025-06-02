// src/api-tester/core/validateConfig.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { resolveProjectPath } from "./utils.ts";

/**
 * Beschreibt die Struktur eines Endpoints, wie er in config.json definiert ist.
 */
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
 * @returns `true`, wenn mindestens eine Datei fehlt, sonst `false`
 */
export function validateConfig(endpoints: EndpointConfig[]): boolean {
  let missingDetected = false;

  for (const ep of endpoints) {
    // 1) Prüfe, ob bodyFile existiert (falls angegeben)
    if (ep.bodyFile) {
      const bodyPath = resolveProjectPath(ep.bodyFile);
      if (!existsSync(bodyPath)) {
        console.warn(
          `⚠️ Warnung: request-Body-Datei fehlt: "${ep.bodyFile}" für Endpoint "${ep.name}".`,
        );
        missingDetected = true;
      }
    }

    // 2) Prüfe, ob expectedStructure existiert (falls angegeben)
    if (ep.expectedStructure) {
      const expectedPath = resolveProjectPath(ep.expectedStructure);
      if (!existsSync(expectedPath)) {
        console.warn(
          `⚠️ Warnung: expected-Schema-Datei fehlt: "${ep.expectedStructure}" für Endpoint "${ep.name}".`,
        );
        missingDetected = true;
      }
    }
  }

  if (!missingDetected) {
    console.log("✅ Alle referenzierten Dateien in config.json vorhanden.");
  }

  return missingDetected;
}
