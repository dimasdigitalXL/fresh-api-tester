// src/api-tester/core/endpointRunner.ts

import { expandGlob } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import type { RepoInfo, SchemaUpdate } from "./gitPush.ts";
import { resolveProjectPath } from "./utils.ts";
import defaultIdsRaw from "../default-ids.json" with { type: "json" };
import { checkAndUpdateApiVersion } from "./versionChecker.ts";
import { testEndpoint, TestResult } from "./apiCaller.ts";
import { promptUserForId } from "./promptHelper.ts";

type DefaultIds = Record<string, string | Record<string, unknown>>;
const _defaultIds = defaultIdsRaw as DefaultIds;

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

export async function runSingleEndpoint(
  endpoint: EndpointConfig,
  _config: { endpoints: EndpointConfig[]; gitRepo: RepoInfo },
  versionUpdates: VersionUpdate[],
  schemaUpdates: SchemaUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult | null> {
  console.debug(`[DEBUG] Starte runSingleEndpoint für "${endpoint.name}"`);

  // 1) Dynamische Pfad-Parameter
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
          console.debug(`🟢 Verwende gespeicherte id: ${defRaw}`);
        } else if (
          isObj &&
          (defRaw as Record<string, unknown>)[k] != null
        ) {
          dynamicParamsOverride[k] = String(
            (defRaw as Record<string, unknown>)[k],
          );
          console.debug(
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
          console.debug(`🟢 Nutzer-Eingabe ${k}: ${ans}`);
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
    console.debug(`🔄 Neue API-Version erkannt: ${versionInfo.url}`);
    return null;
  }

  // 3) URL-Build & Test
  let finalUrl: string;
  try {
    finalUrl = buildUrl(versionInfo.url, dynamicParamsOverride);
  } catch (e: unknown) {
    console.error(
      `❌ URL-Build für "${endpoint.name}" fehlgeschlagen: ${
        (e as Error).message
      }`,
    );
    return null;
  }
  const toTest = { ...versionInfo, url: finalUrl };
  const result = await testEndpoint(toTest, dynamicParamsOverride);

  console.debug(
    `[DEBUG]  result: missing=${result.missingFields.length}, extra=${result.extraFields.length}, typeMismatches=${result.typeMismatches.length}`,
  );

  // 4) Schema-Drift → neue _vN.json anlegen
  const hasDrift = result.missingFields.length > 0 ||
    result.extraFields.length > 0 ||
    result.typeMismatches.length > 0;
  if (hasDrift && result.actualData) {
    const key = endpoint.name.replace(/\s+/g, "_");
    const expectedDir = resolveProjectPath("src", "api-tester", "expected");
    let maxV = 0;
    for await (const file of expandGlob(join(expectedDir, `${key}_v*.json`))) {
      const m = basename(file.path).match(/_v(\d+)\.json$/);
      if (m) maxV = Math.max(maxV, Number(m[1]));
    }
    const nextName = `${key}_v${maxV + 1}.json`;
    const fsPath = join(expectedDir, nextName);
    schemaUpdates.push({ key, fsPath, newSchema: result.actualData });
    console.debug(`🔖 Neuer Schema-Entwurf für "${key}" angelegt: ${nextName}`);
  }

  console.debug(
    `[DEBUG] runSingleEndpoint für "${endpoint.name}" abgeschlossen`,
  );
  return result;
}

/** Baut finale URL wie in apiCaller, hier kopiert */
function buildUrl(template: string, params: Record<string, string>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_m, key) => {
    const p = params[key] ?? Deno.env.get(key);
    if (!p) throw new Error(`Kein Wert für URL-Platzhalter "${key}"`);
    return encodeURIComponent(p);
  });
}
