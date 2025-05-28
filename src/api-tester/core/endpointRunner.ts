// src/api-tester/core/endpointRunner.ts

import { expandGlob } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import type { RepoInfo, SchemaUpdate } from "./gitPush.ts";
import { resolveProjectPath } from "./utils.ts";
import type { Schema } from "./types.ts";
import defaultIdsRaw from "../default-ids.json" with { type: "json" };
import { checkAndUpdateApiVersion } from "./versionChecker.ts";
import { testEndpoint, TestResult } from "./apiCaller.ts";
import { promptUserForId } from "./promptHelper.ts";

// Map für Default-IDs
type DefaultIds = Record<string, string | Record<string, unknown>>;
const _defaultIds = defaultIdsRaw as DefaultIds; // wurde umbenannt, um no-unused-vars zu vermeiden

/** Info, wenn eine neue API-Version erkannt wurde */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * Führt den Test für einen einzelnen Endpoint aus.
 * Bei Schema-Drift legt er eine neue Datei `_vN.json`
 * in `src/api-tester/expected` an und liefert sie via schemaUpdates zurück.
 */
export async function runSingleEndpoint(
  endpoint: EndpointConfig,
  config: { endpoints: EndpointConfig[]; gitRepo: RepoInfo },
  versionUpdates: VersionUpdate[],
  schemaUpdates: SchemaUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult | null> {
  // ─── 1) Dynamische Pfad-Parameter ───────────────────────────
  if (endpoint.requiresId) {
    const keyName = endpoint.name.replace(/\s+/g, "_");
    const defRaw = _defaultIds[keyName] ?? _defaultIds[endpoint.name];
    const isObj = defRaw !== null && typeof defRaw === "object";
    const params = isObj
      ? Object.keys(defRaw as Record<string, unknown>)
      : ["id"];

    for (const paramKey of params) {
      if (!dynamicParamsOverride[paramKey]) {
        if (!isObj && defRaw != null) {
          dynamicParamsOverride.id = String(defRaw);
          console.log(`🟢 Verwende gespeicherte id: ${defRaw}`);
        } else if (
          isObj &&
          (defRaw as Record<string, unknown>)[paramKey] != null
        ) {
          dynamicParamsOverride[paramKey] = String(
            (defRaw as Record<string, unknown>)[paramKey],
          );
          console.log(
            `🟢 Verwende gespeicherte ${paramKey}: ${
              dynamicParamsOverride[paramKey]
            }`,
          );
        } else {
          const ans = await promptUserForId(
            `🟡 Bitte Wert für "${paramKey}" bei "${endpoint.name}" angeben: `,
          );
          if (!ans) {
            console.warn(
              `⚠️ Kein Wert für "${paramKey}", überspringe "${endpoint.name}".`,
            );
            return null;
          }
          dynamicParamsOverride[paramKey] = ans;
          console.log(`🟢 Nutzer-Eingabe ${paramKey}: ${ans}`);
        }
      }
    }
  }

  // ─── 2) API-Versionserkennung ───────────────────────────────
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
    // in-memory-Konfiguration aktualisieren
    const idx = config.endpoints.findIndex((e) => e.name === endpoint.name);
    if (idx !== -1) {
      config.endpoints[idx] = versionInfo as EndpointConfig;
    }
    console.log(`🔄 Neue API-Version erkannt: ${versionInfo.url}`);
    return null;
  }

  // ─── 3) Struktur- und Typ-Vergleich ─────────────────────────
  const result = await testEndpoint(
    versionInfo as EndpointConfig,
    dynamicParamsOverride,
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

  // ─── 4) Schema-Drift: versionierte Datei anlegen ────────────
  const hasDrift = missingFields.length > 0 ||
    extraFields.length > 0 ||
    typeMismatches.length > 0;
  if (hasDrift) {
    const key = endpoint.name.replace(/\s+/g, "_");
    const expectedDir = resolveProjectPath("src", "api-tester", "expected");

    // a) vorhandene Versionen (_vN.json) ermitteln
    let maxVersion = 0;
    const globPattern = join(expectedDir, `${key}_v*.json`);
    for await (const file of expandGlob(globPattern)) {
      const m = basename(file.path).match(/_v(\d+)\.json$/);
      if (m) {
        const v = Number(m[1]);
        if (!isNaN(v) && v > maxVersion) maxVersion = v;
      }
    }

    // b) nächster Versions-Suffix
    const targetName = `${key}_v${maxVersion + 1}.json`;
    const fsPath = join(expectedDir, targetName);

    schemaUpdates.push({
      key,
      fsPath,
      newSchema: actualData as Schema,
    });
    console.log(`🔖 Neuer Schema-Entwurf für „${key}“ angelegt: ${targetName}`);
  }

  return result;
}
