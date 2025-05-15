// src/api-tester/core/apiCaller.ts

import axios from "https://esm.sh/axios@1.4.0";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import type { EndpointConfig as Endpoint } from "./configLoader.ts";
import { analyzeResponse } from "./structureAnalyzer.ts";

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
}

export async function testEndpoint(
  endpoint: Endpoint,
  dynamicParams: Record<string, string> = {},
  config?: { endpoints: Endpoint[] },
): Promise<TestResult> {
  try {
    // 1) URL-Platzhalter ersetzen
    let url = endpoint.url.replace(
      "${XENTRAL_ID}",
      Deno.env.get("XENTRAL_ID") ?? "",
    );
    for (const [k, v] of Object.entries(dynamicParams)) {
      url = url.replace(`{${k}}`, v);
    }

    // 2) Query-String bauen
    const qs = endpoint.query
      ? "?" + new URLSearchParams(endpoint.query).toString()
      : "";

    // 3) Body laden (falls nötig)
    let data: unknown;
    if (
      ["POST", "PUT", "PATCH"].includes(endpoint.method) &&
      endpoint.bodyFile
    ) {
      const bf = join(Deno.cwd(), endpoint.bodyFile);
      if (existsSync(bf)) {
        data = JSON.parse(await Deno.readTextFile(bf));
      }
    }

    // 4) Header + Auth
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

    // 5) Request log + ausführen
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

    // 6) HTTP-Fehler behandeln
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
      };
    }
    console.log(`✅ Antwort für ${endpoint.name}: Status ${resp.status}`);

    // 7) Falls kein Schema erwartet, direkt OK
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

    // 8) Erwartetes Schema laden – immer relativ zum Projekt-Root
    const expectedRel = endpoint.expectedStructure;
    const expectedPath = join(Deno.cwd(), expectedRel);
    console.log(
      `🔍 endpoint.expectedStructure = ${expectedRel} → resolvedPath = ${expectedPath}`,
    );
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

    // 9) Struktur-& Typvergleich
    const key = endpoint.name.replace(/\s+/g, "_");
    const { missingFields, extraFields, typeMismatches } =
      await analyzeResponse(
        key,
        expectedPath,
        resp.data ?? {},
      );

    const hasDiff = missingFields.length > 0 ||
      extraFields.length > 0 ||
      typeMismatches.length > 0;

    // 10) Optional: Automatisches Schema-Update bei Genehmigung
    let updatedStructure: string | null = null;
    if (hasDiff) {
      updatedStructure = key;
      if (config) {
        const approvalsPath = join(Deno.cwd(), "pending-approvals.json");
        if (existsSync(approvalsPath)) {
          const approvals = JSON.parse(
            await Deno.readTextFile(approvalsPath),
          ) as Record<string, string>;
          if (approvals[key] === "approved") {
            const ep = config.endpoints.find((e) => e.name === endpoint.name);
            if (ep) {
              ep.expectedStructure = `expected/${key}.json`;
              await Deno.writeTextFile(
                join(Deno.cwd(), "config.json"),
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

    // 11) Ergebnis zurückgeben
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
    };
  } catch (err) {
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
    };
  }
}
