// src/api-tester/core/apiCaller.ts

import axios from "https://esm.sh/axios@1.4.0";
import { ensureDir, existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.216.0/path/mod.ts";
import { resolveProjectPath } from "./utils.ts";
import { analyzeResponse } from "./structureAnalyzer.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface TestResult {
  endpointName: string;
  method: Method;
  success: boolean;
  isCritical: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  errorDetails?: string;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: Array<{ path: string; expected: string; actual: string }>;
  updatedStructure: string | null;
  expectedFile?: string;
  expectedMissing?: boolean;
  expectedData?: unknown;
  actualData: unknown;
}

/** Sucht eine existierende expected-JSON im Projekt */
function findExpectedPath(relativePath: string): string | null {
  const projectRoot = Deno.cwd();
  const candidates = [
    join(projectRoot, "src", "expected", relativePath),
    join(projectRoot, "src", "api-tester", "expected", relativePath),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      console.debug(`🔍 Erwartetes Schema gefunden: ${p}`);
      return p;
    }
  }
  console.warn(
    `⚠️ Erwartetes Schema nicht gefunden in:\n  ${candidates.join("\n  ")}`,
  );
  return null;
}

export interface Endpoint {
  name: string;
  url: string;
  method: Method;
  expectedStructure?: string;
  /** auch Zahlen in Query erlauben */
  query?: Record<string, string | number>;
  bodyFile?: string;
  headers?: Record<string, string>;
}

export async function testEndpoint(
  endpoint: Endpoint,
  dynamicParams: Record<string, string> = {},
  config?: { endpoints: Endpoint[] },
): Promise<TestResult> {
  try {
    // ---- 1) URL zusammenbauen ----
    let url = endpoint.url.replace(
      "${XENTRAL_ID}",
      Deno.env.get("XENTRAL_ID") ?? "",
    );
    for (const [k, v] of Object.entries(dynamicParams)) {
      url = url.replace(`{${k}}`, v);
    }
    const qs = endpoint.query
      ? "?" + new URLSearchParams(
        Object.entries(endpoint.query).map(([k, v]) => [k, String(v)]),
      ).toString()
      : "";

    // ---- 2) Body laden (falls nötig) ----
    let data: unknown;
    if (
      ["POST", "PUT", "PATCH"].includes(endpoint.method) &&
      endpoint.bodyFile
    ) {
      const bf = resolveProjectPath(endpoint.bodyFile);
      if (existsSync(bf)) {
        data = JSON.parse(await Deno.readTextFile(bf));
      }
    }

    // ---- 3) Header + Auth ----
    const baseHeaders = endpoint.headers ?? {};
    const headers: Record<string, string> = {
      ...baseHeaders,
      Authorization: baseHeaders.Authorization?.includes("${BEARER_TOKEN}")
        ? baseHeaders.Authorization.replace(
          "${BEARER_TOKEN}",
          Deno.env.get("BEARER_TOKEN") ?? "",
        )
        : baseHeaders.Authorization ??
          `Bearer ${Deno.env.get("BEARER_TOKEN")}`,
    };

    // ---- 4) Request ausführen ----
    const fullUrl = `${url}${qs}`;
    console.log("▶️ Request für", endpoint.name);
    console.log("   URL:   ", fullUrl);
    console.log("   Header:", JSON.stringify(headers));
    const resp = await axios.request({
      url: fullUrl,
      method: endpoint.method,
      data,
      headers,
      validateStatus: () => true,
    });

    const actualData = resp.data;

    // ---- 5) Tatsächliche Response speichern ----
    const responsesDir = join(__dirname, "../responses");
    try {
      await ensureDir(responsesDir);
      const responseFile = join(responsesDir, `${endpoint.name}.json`);
      await Deno.writeTextFile(
        responseFile,
        JSON.stringify(actualData, null, 2) + "\n",
      );
      console.info(
        `✅ Response für "${endpoint.name}" gespeichert: ${responseFile}`,
      );
    } catch (err: unknown) {
      const warnMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ Konnte Response für "${endpoint.name}" nicht speichern: ${warnMsg}`,
      );
    }

    // ---- 6) HTTP-Fehler behandeln ----
    if (resp.status < 200 || resp.status >= 300) {
      const msg = `HTTP ${resp.status} (${resp.statusText || "Error"})`;
      console.error(`❌ API-Fehler für ${endpoint.name}:`, msg);
      return {
        endpointName: endpoint.name,
        method: endpoint.method,
        success: false,
        isCritical: true,
        statusCode: resp.status,
        errorMessage: null,
        errorDetails: msg,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        updatedStructure: null,
        actualData,
      };
    }
    console.log(`✅ Antwort für ${endpoint.name}: Status ${resp.status}`);

    // ---- 7) Kein expectedSchema konfiguriert ----
    if (!endpoint.expectedStructure) {
      return {
        endpointName: endpoint.name,
        method: endpoint.method,
        success: true,
        isCritical: false,
        statusCode: resp.status,
        errorMessage: null,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        updatedStructure: null,
        actualData,
      };
    }

    // ---- 8) Expected-Schema laden ----
    const expectedRelative = endpoint.expectedStructure.replace(
      /^expected\/+/,
      "",
    );
    const expectedPath = findExpectedPath(expectedRelative);
    if (!expectedPath) {
      return {
        endpointName: endpoint.name,
        method: endpoint.method,
        success: false,
        isCritical: false,
        statusCode: resp.status,
        errorMessage: null,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        updatedStructure: null,
        expectedFile: endpoint.expectedStructure,
        expectedMissing: true,
        actualData,
      };
    }
    const expectedText = await Deno.readTextFile(expectedPath);
    const expectedData = JSON.parse(expectedText);

    // ---- 9) Struktur-Vergleich ----
    const key = endpoint.name.replace(/\s+/g, "_");
    const { missingFields, extraFields, typeMismatches } =
      await analyzeResponse(key, expectedPath, actualData);

    const hasDiff = missingFields.length > 0 ||
      extraFields.length > 0 ||
      typeMismatches.length > 0;

    // ---- 10) Optional: Approval-Mechanismus ----
    let updatedStructure: string | null = null;
    if (hasDiff && config) {
      updatedStructure = key;
    }

    // ---- 11) Ergebnis zurückgeben ----
    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success: !hasDiff,
      isCritical: hasDiff,
      statusCode: resp.status,
      errorMessage: null,
      missingFields,
      extraFields,
      typeMismatches,
      updatedStructure,
      expectedFile: expectedPath,
      expectedMissing: false,
      expectedData,
      actualData,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Exception in ${endpoint.name}:`, msg);
    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success: false,
      isCritical: true,
      statusCode: null,
      errorMessage: msg,
      errorDetails: msg,
      missingFields: [],
      extraFields: [],
      typeMismatches: [],
      updatedStructure: null,
      actualData: err,
    };
  }
}
