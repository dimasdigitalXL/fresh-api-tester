// src/api-tester/core/apiCaller.ts

import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig } from "./configLoader.ts";
import { analyzeResponse } from "./structureAnalyzer.ts";
import type { Schema } from "./types.ts";

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

export async function testEndpoint(
  ep: EndpointConfig,
  _dynamicParamsOverride: Record<string, string> = {},
): Promise<TestResult> {
  const result: TestResult = {
    endpointName: ep.name,
    method: ep.method,
    url: ep.url,
    status: 0,
    body: undefined,
    expectedMissing: false,
    missingFields: [],
    extraFields: [],
    typeMismatches: [],
  };

  // 1) Request absetzen
  const resp = await fetch(ep.url, { method: ep.method });
  result.status = resp.status;
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = await resp.text();
  }
  result.body = body;

  // 2) Schema-Vergleich
  try {
    const diff = await analyzeResponse(
      ep.name.replace(/\s+/g, "_"),
      join(
        Deno.cwd(),
        "src",
        "api-tester",
        "expected",
        `${ep.name.replace(/\s+/g, "_")}.json`,
      ),
      body,
    );
    result.missingFields = diff.missingFields;
    result.extraFields = diff.extraFields;
    result.typeMismatches = diff.typeMismatches;
    result.actualData = diff.updatedSchema;
    result.expectedFile = diff.filename;
  } catch {
    result.expectedMissing = true;
  }

  // 3) LOCAL_MODE → Antwort lokal speichern
  if (Deno.env.get("LOCAL_MODE") === "true") {
    const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
    await Deno.mkdir(outDir, { recursive: true });
    const txt = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    await Deno.writeTextFile(join(outDir, `${ep.name}.json`), txt);
    console.log(`📝 [LOCAL] Response für "${ep.name}" gespeichert`);
  }

  return result;
}
