// src/api-tester/core/apiCaller.ts

import axios from "https://esm.sh/axios@1.4.0";
import {
  ensureFileSync,
  existsSync,
} from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { getNextUpdatedPath, transformValues } from "./structureAnalyzer.ts";
import { compareStructures } from "./compareStructures.ts";
import { resolveProjectPath } from "./utils.ts";

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
  typeMismatches: Array<{
    path: string;
    expected: string;
    actual: string;
  }>;
  updatedStructure: string | null;
}

export interface Endpoint {
  name: string;
  url: string;
  method: Method;
  expectedStructure?: string;
  query?: Record<string, string>;
  bodyFile?: string;
  headers?: Record<string, string>;
}

export async function testEndpoint(
  endpoint: Endpoint,
  dynamicParams: Record<string, string> = {},
  config?: { endpoints: Endpoint[] },
): Promise<TestResult> {
  try {
    // 1) Platzhalter ersetzen
    let url = endpoint.url.replace(
      "${XENTRAL_ID}",
      Deno.env.get("XENTRAL_ID") ?? "",
    );
    for (const [k, v] of Object.entries(dynamicParams)) {
      url = url.replace(`{${k}}`, v);
    }

    // 2) Querystring
    const qs = endpoint.query
      ? "?" + new URLSearchParams(endpoint.query).toString()
      : "";

    // 3) Body laden
    let data: unknown = undefined;
    if (
      ["POST", "PUT", "PATCH"].includes(endpoint.method) &&
      endpoint.bodyFile
    ) {
      const bf = resolveProjectPath(endpoint.bodyFile);
      if (existsSync(bf)) {
        const raw = await Deno.readTextFile(bf);
        data = JSON.parse(raw);
      }
    }

    // 4) Headers aus config lesen (oder Standard setzen)
    const headersConfig = endpoint.headers ?? {};
    const headers: Record<string, string> = {
      ...headersConfig,
      // Immer sicherstellen, dass Authorization aus ENV kommt
      Authorization: headersConfig.Authorization?.includes("${BEARER_TOKEN}")
        ? headersConfig.Authorization.replace(
          "${BEARER_TOKEN}",
          Deno.env.get("BEARER_TOKEN") ?? "",
        )
        : headersConfig.Authorization ??
          `Bearer ${Deno.env.get("BEARER_TOKEN")}`,
    };

    // 4.1) Debug-Log: URL + Header
    const fullUrl = `${url}${qs}`;
    console.log("▶️ Request für", endpoint.name);
    console.log("   URL:   ", fullUrl);
    console.log("   Header:", JSON.stringify(headers));

    // 5) Request ausführen
    const resp = await axios.request({
      url: fullUrl,
      method: endpoint.method,
      data,
      headers,
      validateStatus: () => true,
    });

    // 5.1) 2xx als Erfolg, alles andere als kritischen Fehler behandeln
    if (resp.status < 200 || resp.status >= 300) {
      const msg = `HTTP ${resp.status} (${resp.statusText || "Not OK"})`;
      console.error(`❌ API-Fehler für ${endpoint.name}: ${msg}`);
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
      };
    }

    console.log(`✅ Antwort für ${endpoint.name}: Status ${resp.status}`);
    console.log("API Antwort:", JSON.stringify(resp.data, null, 2));

    // 6) Wenn kein expectedStructure → Erfolg
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
      };
    }

    // 7) Erwartete Struktur laden
    const expectedPath = resolveProjectPath(endpoint.expectedStructure);
    if (!existsSync(expectedPath)) {
      const msg = `Erwartete Datei nicht gefunden: ${expectedPath}`;
      console.warn(`⚠️ ${msg}`);
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
      };
    }
    const expectedText = await Deno.readTextFile(expectedPath);
    const expected = JSON.parse(expectedText);

    console.log(
      `🔍 Geladene erwartete Struktur (${endpoint.expectedStructure}):`,
    );
    console.log(JSON.stringify(expected, null, 2));

    // 8) Vergleichen
    const transformed = transformValues(resp.data ?? {});
    console.log("🔍 Transformierte API-Antwort:");
    console.log(JSON.stringify(transformed, null, 2));

    const { missingFields, extraFields, typeMismatches } = compareStructures(
      expected,
      transformed,
    );
    const hasDiff = missingFields.length > 0 ||
      extraFields.length > 0 ||
      typeMismatches.length > 0;

    // 9) errorDetails generieren
    let errorDetails: string | undefined;
    if (hasDiff) {
      const parts: string[] = [];
      if (missingFields.length > 0) {
        parts.push(`Fehlende Felder: ${missingFields.join(", ")}`);
      }
      if (extraFields.length > 0) {
        parts.push(`Unerwartete Felder: ${extraFields.join(", ")}`);
      }
      if (typeMismatches.length > 0) {
        parts.push(
          `Typabweichungen: ${
            typeMismatches
              .map((t) =>
                `${t.path} (erwartet ${t.expected}, actual ${t.actual})`
              )
              .join("; ")
          }`,
        );
      }
      errorDetails = parts.join(" | ");
      console.warn(`⚠️ Abweichungen bei ${endpoint.name}: ${errorDetails}`);
    } else {
      console.log(`✅ Struktur stimmt für ${endpoint.name}`);
    }

    // 10) Neue Struktur speichern
    let updatedStructure: string | null = null;
    if (hasDiff) {
      const baseName = endpoint.name.replace(/\s+/g, "_");
      const nextPath = getNextUpdatedPath(baseName);
      ensureFileSync(nextPath);
      await Deno.writeTextFile(nextPath, JSON.stringify(transformed, null, 2));
      console.log(`📄 Saved updated structure: ${nextPath}`);
      updatedStructure = basename(nextPath);

      // 11) Genehmigte Struktur in config übernehmen
      if (config && endpoint.expectedStructure) {
        const approvalsPath = resolveProjectPath("pending-approvals.json");
        if (existsSync(approvalsPath)) {
          const raw = await Deno.readTextFile(approvalsPath);
          const approvals = JSON.parse(raw) as Record<string, string>;
          const key = baseName;
          if (approvals[key] === "approved") {
            const ep = config.endpoints.find((e) => e.name === endpoint.name);
            if (ep) {
              ep.expectedStructure = join("expected", updatedStructure);
              await Deno.writeTextFile(
                resolveProjectPath("config.json"),
                JSON.stringify(config, null, 2),
              );
              console.log(`🛠️ config.json updated: ${ep.expectedStructure}`);
            }
            approvals[key] = "waiting";
            await Deno.writeTextFile(
              approvalsPath,
              JSON.stringify(approvals, null, 2),
            );
          }
        }
      }
    }

    // 12) TestResult zurückgeben
    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success: !hasDiff,
      isCritical: hasDiff,
      statusCode: resp.status,
      errorMessage: null,
      errorDetails,
      missingFields,
      extraFields,
      typeMismatches,
      updatedStructure,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error in ${endpoint.name}:`, msg);
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
    };
  }
}
