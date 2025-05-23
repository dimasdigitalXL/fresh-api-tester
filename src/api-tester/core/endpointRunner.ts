// src/api-tester/core/endpointRunner.ts

import { expandGlob } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import type { RepoInfo, SchemaUpdate } from "./gitPush.ts";
import { resolveProjectPath } from "./utils.ts";
import type { Schema } from "./types.ts";
import defaultIdsRaw from "../default-ids.json" with { type: "json" };
import { checkAndUpdateApiVersion } from "./versionChecker.ts";
import { testEndpoint } from "./apiCaller.ts";
import { promptUserForId } from "./promptHelper.ts";

// Typisierung des importierten JSON als Map von Default-IDs
type DefaultIds = Record<string, string | Record<string, unknown>>;
const defaultIds = defaultIdsRaw as DefaultIds;

/** Informationen über erkannte neue API-Versionen */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * Führt den Test für einen einzelnen Endpoint aus und legt bei Schema-Drift
 * eine neue Datei src/api-tester/expected/{Key}[ _v{n} ].json an.
 */
export async function runSingleEndpoint(
  endpoint: EndpointConfig,
  config: { endpoints: EndpointConfig[]; gitRepo: RepoInfo },
  versionUpdates: VersionUpdate[],
  schemaUpdates: SchemaUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<import("./apiCaller.ts").TestResult | null> {
  // 1) Dynamische Pfad-Parameter (z.B. {id})
  if (endpoint.requiresId) {
    const keyName = endpoint.name.replace(/\s+/g, "_");
    const defRaw = defaultIds[keyName] ?? defaultIds[endpoint.name];
    const isObj = defRaw !== null && typeof defRaw === "object";
    const params = isObj
      ? Object.keys(defRaw as Record<string, unknown>)
      : ["id"];

    for (const key of params) {
      if (!dynamicParamsOverride[key]) {
        if (!isObj && defRaw != null) {
          dynamicParamsOverride.id = String(defRaw);
          console.log(`🟢 Verwende gespeicherte id: ${defRaw}`);
        } else if (isObj && (defRaw as Record<string, unknown>)[key] != null) {
          dynamicParamsOverride[key] = String(
            (defRaw as Record<string, unknown>)[key],
          );
          console.log(
            `🟢 Verwende gespeicherte ${key}: ${dynamicParamsOverride[key]}`,
          );
        } else {
          const ans = await promptUserForId(
            `🟡 Bitte Wert für "${key}" bei "${endpoint.name}" angeben: `,
          );
          if (!ans) {
            console.warn(
              `⚠️ Kein Wert für "${key}", überspringe "${endpoint.name}".`,
            );
            return null;
          }
          dynamicParamsOverride[key] = ans;
          console.log(`🟢 Nutzer-Eingabe ${key}: ${ans}`);
        }
      }
    }
  }

  // 2) API-Versionserkennung
  const versionInfo = await checkAndUpdateApiVersion(
    endpoint,
    dynamicParamsOverride,
  );
  if (versionInfo.versionChanged) {
    versionUpdates.push({
      name: endpoint.name,
      url: versionInfo.url,
      expectedStructure: endpoint.expectedStructure,
    });
    const idx = config.endpoints.findIndex((e) => e.name === endpoint.name);
    if (idx !== -1) config.endpoints[idx] = versionInfo as EndpointConfig;
    console.log(`🔄 Neue API-Version erkannt: ${versionInfo.url}`);
    return null;
  }

  // 3) Struktur- und Typ-Vergleich
  const result = await testEndpoint(
    versionInfo as EndpointConfig,
    dynamicParamsOverride,
    config,
  );
  const { missingFields, extraFields, typeMismatches, actualData } = result;

  if (missingFields.length) {
    console.log(`❌ Fehlende Felder: ${missingFields.join(", ")}`);
  }
  if (extraFields.length) {
    console.log(`➕ Neue Felder: ${extraFields.join(", ")}`);
  }
  if (typeMismatches.length) {
    console.log("⚠️ Typabweichungen:");
    for (const tm of typeMismatches) {
      console.log(
        `• ${tm.path}: erwartet ${tm.expected}, erhalten ${tm.actual}`,
      );
    }
  }

  // 4) Schema-Update protokollieren und versioniert ablegen
  if (missingFields.length || extraFields.length || typeMismatches.length) {
    const key = endpoint.name.replace(/\s+/g, "_");
    const expectedDir = resolveProjectPath("src/api-tester/expected");
    const baseName = `${key}.json`;

    // 4a) existierende Versionen (_vN.json) ermitteln
    const globPattern = join(expectedDir, `${key}_v*.json`);
    let maxVersion = 0;
    for await (const file of expandGlob(globPattern)) {
      const name = basename(file.path); // z.B. "Get_View_Customer_v2.json"
      const m = name.match(/_v(\d+)\.json$/);
      if (m) {
        const v = Number(m[1]);
        if (!isNaN(v) && v > maxVersion) maxVersion = v;
      }
    }

    // 4b) Ziel-Dateiname bestimmen
    let targetName: string;
    if (maxVersion === 0) {
      // noch keine _vN, prüfe ob key.json existiert
      const plainPath = join(expectedDir, baseName);
      try {
        await Deno.stat(plainPath);
        // key.json existiert → lege _v1 an
        targetName = `${key}_v1.json`;
      } catch {
        // key.json nicht vorhanden → lege key.json an
        targetName = baseName;
      }
    } else {
      // nächste Version
      targetName = `${key}_v${maxVersion + 1}.json`;
    }

    const fsPath = join(expectedDir, targetName);
    schemaUpdates.push({ key, fsPath, newSchema: actualData as Schema });
    console.log(`🔖 Neuer Schema-Entwurf für "${key}" angelegt: ${targetName}`);
  }

  return result;
}
