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
import { kvInstance } from "./kv.ts";

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
    // 1) URL‐Platzhalter
    let url = endpoint.url.replace(
      "${XENTRAL_ID}",
      Deno.env.get("XENTRAL_ID") ?? "",
    );
    for (const [k, v] of Object.entries(dynamicParams)) {
      url = url.replace(`{${k}}`, v);
    }

    // 2) Query‐String
    const qs = endpoint.query
      ? "?" + new URLSearchParams(endpoint.query).toString()
      : "";

    // 3) Body
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

    // 5) Request log + execute
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

    // 6) HTTP‐Error
    if (resp.status < 200 || resp.status >= 300) {
      const msg = `HTTP ${resp.status} (${resp.statusText || "Error"})`;
      console.error(`❌ API‐Fehler für ${endpoint.name}:`, msg);
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

    // 7) Kein Schema → sofort OK
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

    // 8) Erwartete Struktur laden
    const parts = endpoint.expectedStructure.split("/");
    const expectedPath = resolveProjectPath(...parts);
    console.log("🔍 Erwartete Struktur wird geladen von:", expectedPath);
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
    const expected = JSON.parse(await Deno.readTextFile(expectedPath));

    // 9) Schema‐Vergleich
    const transformed = transformValues(resp.data ?? {});
    const { missingFields, extraFields, typeMismatches } = compareStructures(
      expected,
      transformed,
    );
    const hasDiff = missingFields.length > 0 ||
      extraFields.length > 0 ||
      typeMismatches.length > 0;

    // 10) errorDetails
    let errorDetails: string | undefined;
    if (hasDiff) {
      const parts: string[] = [];
      if (missingFields.length) {
        parts.push(`Fehlende Felder: ${missingFields.join(", ")}`);
      }
      if (extraFields.length) {
        parts.push(`Unerwartete Felder: ${extraFields.join(", ")}`);
      }
      if (typeMismatches.length) {
        parts.push(
          `Typabweichungen: ${
            typeMismatches.map((t) =>
              `${t.path} (erw. ${t.expected}, ist ${t.actual})`
            ).join("; ")
          }`,
        );
      }
      errorDetails = parts.join(" | ");
      console.warn(`⚠️ Abweichungen bei ${endpoint.name}:`, errorDetails);
    } else {
      console.log(`✅ Struktur stimmt für ${endpoint.name}`);
    }

    // 11) Bei Diff → versuchen lokal zu schreiben, sonst in KV
    let updatedStructure: string | null = null;
    if (hasDiff) {
      const baseName = endpoint.name.replace(/\s+/g, "_");
      const nextPath = getNextUpdatedPath(baseName);
      console.log(
        "📄 (lokal) neue Struktur soll gespeichert werden unter:",
        nextPath,
      );

      try {
        ensureFileSync(nextPath);
        await Deno.writeTextFile(
          nextPath,
          JSON.stringify(transformed, null, 2),
        );
        console.log(`📄 Saved updated structure: ${nextPath}`);
        updatedStructure = basename(nextPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `⚠️ Konnte Struktur nicht lokal schreiben (readonly FS), speichere in KV: ${msg}`,
        );
        await kvInstance.set(["updates", baseName], transformed);
        console.log(`✅ Updated structure for '${baseName}' in KV gespeichert`);
        updatedStructure = baseName;
      }

      // und falls approved → config updaten
      if (config) {
        const approvalsPath = resolveProjectPath("pending-approvals.json");
        if (existsSync(approvalsPath)) {
          const approvals = JSON.parse(
            await Deno.readTextFile(approvalsPath),
          ) as Record<string, string>;
          if (approvals[baseName] === "approved") {
            const ep = config.endpoints.find((e) => e.name === endpoint.name);
            if (ep) {
              ep.expectedStructure = join("expected", updatedStructure);
              await Deno.writeTextFile(
                resolveProjectPath("config.json"),
                JSON.stringify(config, null, 2),
              );
              console.log(`🛠️ config.json updated: ${ep.expectedStructure}`);
            }
            approvals[baseName] = "waiting";
            await Deno.writeTextFile(
              approvalsPath,
              JSON.stringify(approvals, null, 2),
            );
          }
        }
      }
    }

    // 12) Ergebnis zurückgeben
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
