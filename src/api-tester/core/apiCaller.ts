// src/api-tester/core/apiCaller.ts

import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import { analyzeResponse } from "./structureAnalyzer.ts";
import type { Schema } from "./types.ts";

/**
 * Ergebnis eines API-Tests inklusive Schema-Abgleich.
 */
export interface TestResult {
  endpointName: string;
  method: string;
  url: string;
  status: number;
  body: unknown;

  expectedMissing: boolean;
  expectedFile?: string;

  missingFields: string[];
  extraFields: string[];
  typeMismatches: { path: string; expected: string; actual: string }[];

  /** Transformiertes Schema (für Versionierung) */
  actualData?: Schema;
}

/**
 * Sucht im expected-Ordner nach einer Datei, die mit `key` beginnt.
 * Gibt den absoluten Pfad zurück oder wirft, wenn keine gefunden wurde.
 */
async function findExpectedFile(key: string): Promise<string> {
  const expectedDir = join(Deno.cwd(), "src", "api-tester", "expected");
  for await (const entry of Deno.readDir(expectedDir)) {
    if (!entry.isFile) continue;
    if (entry.name.startsWith(key) && entry.name.endsWith(".json")) {
      return join(expectedDir, entry.name);
    }
  }
  throw new Error(`Schema nicht gefunden: ${key}`);
}

/**
 * Ersetzt Platzhalter ${key} in der URL-Vorlage durch Werte aus params.
 * Wirft, wenn ein Platzhalter keinen Wert hat.
 */
function buildUrl(template: string, params: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_match, key) => {
    const val = params[key];
    if (val === undefined) {
      throw new Error(`Kein Wert für URL-Parameter "${key}"`);
    }
    return encodeURIComponent(val);
  });
}

/**
 * Führt den HTTP-Request durch, parst die Antwort und vergleicht sie
 * mit dem erwarteten Schema.
 */
export async function testEndpoint(
  ep: EndpointConfig,
  dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult> {
  const key = ep.name.replace(/\s+/g, "_");
  console.debug(`[DEBUG] Starte testEndpoint für "${ep.name}" (key="${key}")`);

  // 1) URL zusammenbauen
  let url: string;
  try {
    url = buildUrl(ep.url, dynamicParamsOverride);
    console.debug(`[DEBUG]  → finale URL: ${url}`);
  } catch (_err: unknown) {
    const msg = _err instanceof Error ? _err.message : String(_err);
    throw new Error(`Ungültige URL für "${ep.name}": ${msg}`);
  }

  // 2) Query-Parameter anhängen
  if (ep.query && Object.keys(ep.query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(ep.query)) {
      qs.append(k, String(v));
    }
    url += url.includes("?") ? `&${qs}` : `?${qs}`;
    console.debug(`[DEBUG]  → mit Query-Params: ${url}`);
  }

  // 3) Fetch-Optionen zusammenstellen
  const init: RequestInit & { body?: string } = {
    method: ep.method,
    headers: ep.headers ?? {},
  };
  if (ep.bodyFile) {
    try {
      init.body = await Deno.readTextFile(join(Deno.cwd(), ep.bodyFile));
    } catch (_err: unknown) {
      console.warn(
        `⚠️ bodyFile "${ep.bodyFile}" für "${ep.name}" nicht geladen: ${
          (_err as Error).message
        }`,
      );
    }
  }

  // 4) TestResult initialisieren
  const result: TestResult = {
    endpointName: ep.name,
    method: ep.method,
    url,
    status: 0,
    body: undefined,
    expectedMissing: false,
    missingFields: [],
    extraFields: [],
    typeMismatches: [],
  };

  // 5) HTTP-Request ausführen
  console.debug(`[DEBUG]  → sende Request...`);
  const resp = await fetch(url, init);
  result.status = resp.status;

  // nur einmal aus dem Stream lesen
  const rawText = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
    console.debug(`[DEBUG]  ← JSON geparst`);
  } catch {
    parsed = rawText;
    console.debug(`[DEBUG]  ← roher Text`);
  }
  result.body = parsed;

  // 6) Schema-Vergleich
  try {
    const fsPath = ep.expectedStructure
      ? join(Deno.cwd(), "src", "api-tester", ep.expectedStructure)
      : await findExpectedFile(key);
    console.debug(`[DEBUG]  → verwende Schema-Datei: ${fsPath}`);

    const diff = await analyzeResponse(key, fsPath, parsed);
    result.missingFields = diff.missingFields;
    result.extraFields = diff.extraFields;
    result.typeMismatches = diff.typeMismatches;
    result.actualData = diff.updatedSchema;
    result.expectedFile = ep.expectedStructure ?? fsPath.split("/").pop();
  } catch (_err: unknown) {
    console.warn(
      `⚠️ Schema-Vergleich für "${ep.name}" fehlgeschlagen: ${
        (_err as Error).message
      }`,
    );
    result.expectedMissing = true;
  }

  // 7) LOCAL_MODE → Roh-Antwort lokal speichern
  if (Deno.env.get("LOCAL_MODE") === "true") {
    const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
    await Deno.mkdir(outDir, { recursive: true });
    const txt = typeof parsed === "string"
      ? parsed
      : JSON.stringify(parsed, null, 2);
    await Deno.writeTextFile(join(outDir, `${key}.json`), txt);
    console.log(`📝 [LOCAL] Response für "${ep.name}" gespeichert`);
  }

  return result;
}
