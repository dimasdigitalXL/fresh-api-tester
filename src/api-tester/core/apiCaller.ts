// src/api-tester/core/apiCaller.ts

import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
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

  /** transformiertes Schema (für Versionierung) */
  actualData?: Schema;
}

/**
 * Sucht im expected-Ordner nach einer Datei, die mit `key` beginnt
 * und auf `.json` endet (z.B. `_updated.json` oder `_vN.json`).
 */
async function findExpectedFile(key: string): Promise<string> {
  const expectedDir = join(Deno.cwd(), "src", "api-tester", "expected");
  console.log(`[DEBUG] findExpectedFile: suche in ${expectedDir}`);
  const pattern = new RegExp(`^${key}(?:_.*)?\\.json$`);
  for await (const entry of Deno.readDir(expectedDir)) {
    if (!entry.isFile) continue;
    console.log(`[DEBUG]  – gefunden: ${entry.name}`);
    if (pattern.test(entry.name)) {
      const matched = join(expectedDir, entry.name);
      console.log(`[DEBUG]  >> match für "${key}" → ${entry.name}`);
      return matched;
    }
  }
  throw new Error(`Schema nicht gefunden für Schlüssel "${key}"`);
}

/**
 * Ersetzt Platzhalter ${key} in der URL-Vorlage durch Werte aus params.
 */
function buildUrl(template: string, params: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => {
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
  console.log(`\n[DEBUG] Starte testEndpoint für "${ep.name}" (key="${key}")`);

  // 1) URL bauen
  let url: string;
  try {
    url = buildUrl(ep.url, dynamicParamsOverride);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültige URL für "${ep.name}": ${msg}`);
  }
  console.log(`[DEBUG]  → finale URL: ${url}`);

  // 2) Query-Parameter anhängen
  if (ep.query && Object.keys(ep.query).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(ep.query)) {
      qs.append(k, String(v));
    }
    url += url.includes("?") ? `&${qs}` : `?${qs}`;
    console.log(`[DEBUG]  → mit Query-Params: ${url}`);
  }

  // 3) Fetch-Optionen
  const init: RequestInit & { body?: string } = {
    method: ep.method,
    headers: ep.headers ?? {},
  };
  if (ep.bodyFile) {
    const bf = join(Deno.cwd(), ep.bodyFile);
    try {
      init.body = await Deno.readTextFile(bf);
      console.log(`[DEBUG]  → bodyFile geladen: ${bf}`);
    } catch {
      console.warn(`⚠️ bodyFile "${ep.bodyFile}" nicht geladen.`);
    }
  }

  // 4) Ergebnis-Objekt vorbereiten
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
    actualData: undefined,
  };

  // 5) Request ausführen und Antwort ein einziges Mal lesen
  console.log(`[DEBUG]  → sende Request...`);
  const resp = await fetch(url, init);
  result.status = resp.status;
  console.log(`[DEBUG]  ← Status ${resp.status}`);

  const raw = await resp.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
    console.log(`[DEBUG]  ← Antwort als JSON geparst`);
  } catch {
    body = raw;
    console.log(`[DEBUG]  ← Antwort als roher Text`);
  }
  result.body = body;

  // 6) Schema-Datei ermitteln (ohne doppeltes "expected")
  let fsPath: string;
  try {
    if (ep.expectedStructure) {
      fsPath = join(
        Deno.cwd(),
        "src",
        "api-tester",
        "expected",
        basename(ep.expectedStructure),
      );
    } else {
      fsPath = await findExpectedFile(key);
    }
    console.log(`[DEBUG]  → verwende Schema-Datei: ${fsPath}`);
  } catch (_err: unknown) {
    console.warn(
      `[DEBUG]  → kein Schema gefunden für "${key}", skip Schema-Check.`,
    );
    result.expectedMissing = true;
    return result;
  }

  // 7) Schema vergleichen
  try {
    const diff = await analyzeResponse(key, fsPath, body);
    result.missingFields = diff.missingFields;
    result.extraFields = diff.extraFields;
    result.typeMismatches = diff.typeMismatches;
    result.actualData = diff.updatedSchema;
    result.expectedFile = basename(fsPath);
  } catch (err: unknown) {
    console.warn(
      `⚠️ Schema-Vergleich für "${ep.name}" fehlgeschlagen: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    result.expectedMissing = true;
  }

  // 8) LOCAL_MODE → Roh-Antwort lokal speichern
  if (Deno.env.get("LOCAL_MODE") === "true") {
    const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
    await Deno.mkdir(outDir, { recursive: true });
    const txt = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    await Deno.writeTextFile(join(outDir, `${key}.json`), txt);
    console.log(`[DEBUG]  → lokal gespeichert: responses/${key}.json`);
  }

  console.log(`[DEBUG] testEndpoint für "${ep.name}" beendet`);
  return result;
}
