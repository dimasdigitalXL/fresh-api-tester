// src/api-tester/core/endpointRunner.ts

import type { EndpointConfig as Endpoint } from "./configLoader.ts";
import { promptUserForId } from "./promptHelper.ts";
import { checkAndUpdateApiVersion } from "./versionChecker.ts";
import { testEndpoint } from "./apiCaller.ts";
// JSON‑Import jetzt mit "with" statt "assert"
import defaultIds from "../default-ids.json" with { type: "json" };

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

export async function runSingleEndpoint(
  endpoint: Endpoint,
  config: { endpoints: Endpoint[] },
  versionUpdates: VersionUpdate[],
  dynamicParamsOverride: Record<string, string> = {},
): Promise<Awaited<ReturnType<typeof testEndpoint>> | null> {
  const stripDataPrefix = (s: string) =>
    s.replace(/^data\[0\]\./, "").replace(/^data\./, "");

  // ─── 1️⃣ ID‑Handling ────────────────────────────────────────────────────
  if (endpoint.requiresId) {
    let def = (defaultIds as Record<string, unknown>)[endpoint.name];
    if (def === undefined) {
      def = (defaultIds as Record<string, unknown>)[
        endpoint.name.replace(/\s+/g, "_")
      ];
    }
    console.log("🔍 default-ids.json für", endpoint.name, "→", def);

    const isObj = def !== null && typeof def === "object";
    const params = isObj ? Object.keys(def as Record<string, unknown>) : ["id"];

    for (const key of params) {
      if (!dynamicParamsOverride[key]) {
        if (!isObj && key === "id" && def != null) {
          dynamicParamsOverride.id = String(def);
          console.log(`🟢 Verwende gespeicherte id: ${def}`);
        } else if (
          isObj &&
          (def as Record<string, unknown>)[key] != null
        ) {
          dynamicParamsOverride[key] = String(
            (def as Record<string, unknown>)[key],
          );
          console.log(
            `🟢 Verwende gespeicherte ${key}: ${
              (def as Record<string, unknown>)[key]
            }`,
          );
        } else {
          const ans = await promptUserForId(
            `🟡 Bitte Wert für "${key}" bei "${endpoint.name}" angeben: `,
          );
          if (!ans) {
            console.warn(`⚠️ Kein Wert für ${key}, skip ${endpoint.name}.`);
            return null;
          }
          dynamicParamsOverride[key] = ans;
          console.log(`🟢 Nutzer-Eingabe ${key}: ${ans}`);
        }
      }
    }

    console.log(
      `🚀 Starte Test für "${endpoint.name}" mit Param: ` +
        params.map((k) => `${k}=${dynamicParamsOverride[k]}`).join(", "),
    );
  }

  // ─── 2️⃣ Versionserkennung ──────────────────────────────────────────────
  const updated = await checkAndUpdateApiVersion(
    endpoint,
    dynamicParamsOverride,
  );
  if (updated.versionChanged) {
    versionUpdates.push({
      name: endpoint.name,
      url: updated.url,
      expectedStructure: endpoint.expectedStructure,
    });
    const idx = config.endpoints.findIndex((e) => e.name === endpoint.name);
    if (idx !== -1) config.endpoints[idx] = updated as Endpoint;
    console.log(`🔄 Neue API‑Version erkannt: ${updated.url}`);
    return null; // 2‑Schritt‑Logik: beim nächsten Durchlauf wird verglichen
  }

  // ─── 3️⃣ Struktur‑ & Typvergleich ───────────────────────────────────────
  const result = await testEndpoint(
    updated as Endpoint,
    dynamicParamsOverride,
    config,
  );
  const { missingFields, extraFields, typeMismatches } = result;

  if (missingFields.length) {
    console.log(
      `❌ Fehlende Felder: ${missingFields.map(stripDataPrefix).join(", ")}`,
    );
  }
  if (extraFields.length) {
    console.log(
      `➕ Neue Felder: ${extraFields.map(stripDataPrefix).join(", ")}`,
    );
  }
  if (typeMismatches.length) {
    console.log("⚠️ Typabweichungen:");
    for (const tm of typeMismatches) {
      console.log(
        `• ${
          stripDataPrefix(tm.path)
        }: erwartet ${tm.expected}, erhalten ${tm.actual}`,
      );
    }
  }

  return result;
}
