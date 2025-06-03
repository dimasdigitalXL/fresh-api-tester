// src/api-tester/core/apiCaller.ts

import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import { analyzeResponse } from "./structureAnalyzer.ts";
import type { Schema } from "./types.ts";
import { safeReplace } from "./utils.ts";

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
 * Ersetzt Header-Platzhalter ${KEY} durch Umgebungsvariablenwerte.
 */
function replaceHeaderPlaceholders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const envVars = Deno.env.toObject();
  const replaced: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    replaced[key] = safeReplace(value, envVars);
    if (replaced[key] === "") {
      console.warn(
        `⚠️ Umgebungsvariable für Header "${key}" wurde nicht gefunden`,
      );
    }
  }
  return replaced;
}

export async function testEndpoint(
  ep: EndpointConfig,
  dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult> {
  const key = ep.name.replace(/\s+/g, "_");
  console.debug(`[DEBUG] Starte testEndpoint für "${ep.name}" (key="${key}")`);

  let url: string;
  try {
    url = buildUrl(ep.url, dynamicParamsOverride);
    console.debug(`[DEBUG]  → finale URL: ${url}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültige URL für "${ep.name}": ${msg}`);
  }

  if (ep.query && Object.keys(ep.query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(ep.query)) {
      qs.append(k, String(v));
    }
    url += url.includes("?") ? `&${qs}` : `?${qs}`;
    console.debug(`[DEBUG]  → mit Query-Params: ${url}`);
  }

  const replacedHeaders = replaceHeaderPlaceholders(ep.headers);
  console.debug("🔑 Finaler Header vor Request:", replacedHeaders);

  const init: RequestInit & { body?: string } = {
    method: ep.method,
    headers: replacedHeaders,
  };

  if (ep.bodyFile) {
    try {
      init.body = await Deno.readTextFile(join(Deno.cwd(), ep.bodyFile));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ bodyFile "${ep.bodyFile}" für "${ep.name}" nicht geladen: ${msg}`,
      );
    }
  }

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

  console.debug(`[DEBUG]  → sende Request...`);
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Request für "${ep.name}" fehlgeschlagen: ${msg}`);
  }
  result.status = resp.status;

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
    result.expectedFile = ep.expectedStructure ?? fsPath.split("/").pop()!;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `⚠️ Schema-Vergleich für "${ep.name}" fehlgeschlagen: ${msg}`,
    );
    result.expectedMissing = true;
  }

  if (Deno.env.get("LOCAL_MODE") === "true") {
    const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
    try {
      await Deno.mkdir(outDir, { recursive: true });
      const txt = typeof parsed === "string"
        ? parsed
        : JSON.stringify(parsed, null, 2);
      await Deno.writeTextFile(join(outDir, `${key}.json`), txt);
      console.log(`📝 [LOCAL] Response für "${ep.name}" gespeichert`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ Konnten lokale Response für "${ep.name}" nicht speichern: ${msg}`,
      );
    }
  }

  return result;
}
