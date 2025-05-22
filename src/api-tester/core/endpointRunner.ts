// src/api-tester/core/endpointRunner.ts

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

/**
 * Informationen über erkannte neue API-Versionen
 */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * Führt den Test für einen einzelnen Endpoint aus.
 * @param endpoint          Konfiguration des Endpoints
 * @param config            Gesamte Konfiguration (mit endpoints und gitRepo)
 * @param versionUpdates    Hier hinein werden Version-Änderungen gepusht
 * @param schemaUpdates     Hier hinein werden Schema-Entwürfe bei Feld-/Typ-Änderungen gepusht
 * @param dynamicParamsOverride Überschreibungen für Pfadparameter (z.B. id)
 * @returns TestResult oder null (bei reiner Versionserkennung)
 */
export async function runSingleEndpoint(
  endpoint: EndpointConfig,
  config: { endpoints: EndpointConfig[]; gitRepo: RepoInfo },
  versionUpdates: VersionUpdate[],
  schemaUpdates: SchemaUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<import("./apiCaller.ts").TestResult | null> {
  // ─── 1) Dynamische Pfad-Parameter (z.B. {id}) ──────────────────────────────
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
        } else if (
          isObj &&
          (defRaw as Record<string, unknown>)[key] != null
        ) {
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

  // ─── 2) API-Versionserkennung ──────────────────────────────────────────────
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
    if (idx !== -1) {
      config.endpoints[idx] = versionInfo as EndpointConfig;
    }
    console.log(`🔄 Neue API-Version erkannt: ${versionInfo.url}`);
    return null;
  }

  // ─── 3) Struktur- und Typ-Vergleich ───────────────────────────────────────
  const result = await testEndpoint(
    versionInfo as EndpointConfig,
    dynamicParamsOverride,
    config,
  );
  const {
    missingFields,
    extraFields,
    typeMismatches,
    actualData,
    expectedFile,
    expectedMissing,
  } = result;

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

  // ─── 4) Schema-Update protokollieren, falls Abweichungen existieren ───────
  if (missingFields.length || extraFields.length || typeMismatches.length) {
    const key = endpoint.name.replace(/\s+/g, "_");

    // Pfad bestimmen: bestehende Datei, Konfig-Pfad oder Default-Pfad
    let fsPath: string;
    if (expectedFile && !expectedMissing) {
      fsPath = expectedFile;
    } else if (endpoint.expectedStructure) {
      fsPath = resolveProjectPath(endpoint.expectedStructure);
    } else {
      fsPath = resolveProjectPath(`src/api-tester/expected/${key}.json`);
    }

    const newSchema = actualData as Schema;
    schemaUpdates.push({ key, fsPath, newSchema });
  }

  return result;
}
