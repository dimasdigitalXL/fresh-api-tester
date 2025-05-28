// src/api-tester/core/endpointRunner.ts

import { expandGlob } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import type { RepoInfo, SchemaUpdate } from "./gitPush.ts";
import { resolveProjectPath } from "./utils.ts";
import defaultIdsRaw from "../default-ids.json" with { type: "json" };
import { checkAndUpdateApiVersion } from "./versionChecker.ts";
import { testEndpoint, type TestResult } from "./apiCaller.ts";
import { promptUserForId } from "./promptHelper.ts";

// Map für Default-IDs
type DefaultIds = Record<string, string | Record<string, unknown>>;
const _defaultIds = defaultIdsRaw as DefaultIds;

/** Information über neue API-Version */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * Baut eine finale URL, indem Platzhalter ${KEY} ersetzt werden:
 * - Erst aus dynamicParamsOverride
 * - sonst aus ENV
 * Wirft, wenn kein Wert gefunden wurde.
 */
function buildUrl(template: string, params: Record<string, string>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_m, key) => {
    if (params[key] != null) {
      return encodeURIComponent(params[key]);
    }
    const envVal = Deno.env.get(key);
    if (envVal) {
      return encodeURIComponent(envVal);
    }
    throw new Error(`Kein Wert für URL-Platzhalter "${key}"`);
  });
}

/**
 * Führt alle Tests für einen Endpoint durch:
 * 1) Dynamische Pfad-Parameter ermitteln
 * 2) Neue API-Version erkennen
 * 3) URL interpolieren und Test ausführen
 * 4) Bei Schema-Drift neue _vN.json anlegen
 */
export async function runSingleEndpoint(
  endpoint: EndpointConfig,
  _config: { endpoints: EndpointConfig[]; gitRepo: RepoInfo },
  versionUpdates: VersionUpdate[],
  schemaUpdates: SchemaUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult | null> {
  // ─── 1) Dynamische Pfad-Parameter ───────────────────────────
  if (endpoint.requiresId) {
    const key = endpoint.name.replace(/\s+/g, "_");
    const defRaw = _defaultIds[key] ?? _defaultIds[endpoint.name];
    const isObj = defRaw !== null && typeof defRaw === "object";
    const keys = isObj
      ? Object.keys(defRaw as Record<string, unknown>)
      : ["id"];

    for (const k of keys) {
      if (!dynamicParamsOverride[k]) {
        if (!isObj && defRaw != null) {
          dynamicParamsOverride.id = String(defRaw);
          console.log(`🟢 Verwende gespeicherte id: ${defRaw}`);
        } else if (
          isObj &&
          (defRaw as Record<string, unknown>)[k] != null
        ) {
          dynamicParamsOverride[k] = String(
            (defRaw as Record<string, unknown>)[k],
          );
          console.log(
            `🟢 Verwende gespeicherte ${k}: ${dynamicParamsOverride[k]}`,
          );
        } else {
          const ans = await promptUserForId(
            `🟡 Bitte Wert für "${k}" bei "${endpoint.name}" angeben: `,
          );
          if (!ans) {
            console.warn(
              `⚠️ Kein Wert für "${k}", überspringe "${endpoint.name}".`,
            );
            return null;
          }
          dynamicParamsOverride[k] = ans;
          console.log(`🟢 Nutzer-Eingabe ${k}: ${ans}`);
        }
      }
    }
  }

  // ─── 2) Neue API-Version erkennen ───────────────────────────
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
    console.log(`🔄 Neue API-Version erkannt: ${versionInfo.url}`);
    return null;
  }

  // ─── 3) URL interpolieren & Test ausführen ──────────────────
  let finalUrl: string;
  try {
    finalUrl = buildUrl(versionInfo.url, dynamicParamsOverride);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ URL-Build für "${endpoint.name}" fehlgeschlagen: ${msg}`);
    return null;
  }

  const toTest: EndpointConfig = { ...versionInfo, url: finalUrl };
  const result = await testEndpoint(toTest, dynamicParamsOverride);
  const { missingFields, extraFields, typeMismatches, actualData } = result;

  if (missingFields.length > 0) {
    console.log(`❌ Fehlende Felder: ${missingFields.join(", ")}`);
  }
  if (extraFields.length > 0) {
    console.log(`➕ Neue Felder: ${extraFields.join(", ")}`);
  }
  if (typeMismatches.length > 0) {
    console.log("⚠️ Typabweichungen:");
    for (const tm of typeMismatches) {
      console.log(
        `• ${tm.path}: erwartet ${tm.expected}, erhalten ${tm.actual}`,
      );
    }
  }

  // ─── 4) Schema-Drift → neue Datei versionieren ─────────────
  const hasDrift = missingFields.length > 0 ||
    extraFields.length > 0 ||
    typeMismatches.length > 0;
  if (hasDrift && actualData) {
    const key = endpoint.name.replace(/\s+/g, "_");
    const expectedDir = resolveProjectPath("src", "api-tester", "expected");

    let maxV = 0;
    for await (const file of expandGlob(join(expectedDir, `${key}_v*.json`))) {
      const m = basename(file.path).match(/_v(\d+)\.json$/);
      if (m) {
        const v = Number(m[1]);
        if (!isNaN(v) && v > maxV) maxV = v;
      }
    }

    const nextName = `${key}_v${maxV + 1}.json`;
    const fsPath = join(expectedDir, nextName);

    schemaUpdates.push({
      key,
      fsPath,
      newSchema: actualData,
    });
    console.log(`🔖 Neuer Schema-Entwurf für "${key}" angelegt: ${nextName}`);
  }

  return result;
}
