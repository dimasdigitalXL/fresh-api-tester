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

  /** transformiertes Schema (für Versionierung) */
  actualData?: Schema;
}

/**
 * Sucht im expected-Ordner nach einer Datei, die mit `key` beginnt.
 * Gibt den absolute Pfad zurück oder wirft, wenn keine gefunden wurde.
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

  // 1) URL zusammenbauen: Platzhalter ersetzen
  let url: string;
  try {
    url = buildUrl(ep.url, dynamicParamsOverride);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültige URL für "${ep.name}": ${msg}`);
  }

  // 2) Query-Parameter anhängen
  if (ep.query && Object.keys(ep.query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(ep.query)) {
      qs.append(k, String(v));
    }
    url += url.includes("?") ? `&${qs}` : `?${qs}`;
  }

  // 3) Fetch-Optionen zusammenstellen
  const headers = ep.headers ?? {};
  const init: RequestInit & { body?: string } = {
    method: ep.method,
    headers,
  };

  // optionaler Request-Body aus Datei
  if (ep.bodyFile) {
    const bfPath = join(Deno.cwd(), ep.bodyFile);
    try {
      init.body = await Deno.readTextFile(bfPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ bodyFile "${ep.bodyFile}" für "${ep.name}" nicht geladen: ${msg}`,
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
    actualData: undefined,
  };

  // 5) HTTP-Request ausführen
  const resp = await fetch(url, init);
  result.status = resp.status;
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = await resp.text();
  }
  result.body = body;

  // 6) Schema-Vergleich
  try {
    // Wenn in config.json explizit expectedStructure gesetzt ist, verwende es,
    // sonst suche automatisch nach der passenden Datei
    const fsPath = ep.expectedStructure
      ? join(
        Deno.cwd(),
        "src",
        "api-tester",
        "expected",
        ep.expectedStructure,
      )
      : await findExpectedFile(key);

    const diff = await analyzeResponse(key, fsPath, body);
    result.missingFields = diff.missingFields;
    result.extraFields = diff.extraFields;
    result.typeMismatches = diff.typeMismatches;
    result.actualData = diff.updatedSchema;
    result.expectedFile = ep.expectedStructure ?? fsPath.split("/").pop();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Schema-Vergleich für "${ep.name}" fehlgeschlagen: ${msg}`);
    result.expectedMissing = true;
  }

  // 7) LOCAL_MODE → Roh-Antwort lokal speichern
  if (Deno.env.get("LOCAL_MODE") === "true") {
    const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
    await Deno.mkdir(outDir, { recursive: true });
    const txt = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    await Deno.writeTextFile(join(outDir, `${key}.json`), txt);
    console.log(`📝 [LOCAL] Response für "${ep.name}" gespeichert`);
  }

  return result;
}
