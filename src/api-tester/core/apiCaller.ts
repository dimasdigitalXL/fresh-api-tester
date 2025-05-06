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

/** Diese Literal‑Typen erlauben nur genau diese fünf HTTP‑Methoden */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Endpoint {
  name: string;
  url: string;
  method: Method;
  expectedStructure?: string;
  query?: Record<string, string>;
  bodyFile?: string;
}

export interface TestResult {
  endpointName: string;
  method: Method;
  success: boolean;
  isCritical: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: Array<{
    path: string;
    expected: string;
    actual: string;
  }>;
  updatedStructure: string | null;
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

    // 4) Request ausführen
    const resp = await axios.request({
      url: `${url}${qs}`,
      method: endpoint.method,
      data,
      headers: {
        Authorization: `Bearer ${Deno.env.get("BEARER_TOKEN")}`,
        Accept: "application/json",
        ...(endpoint.method !== "GET"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      validateStatus: () => true,
    });
    const status = resp.status;
    const responseData = resp.data ?? {};

    // 5) Kein expectedStructure → skip
    if (!endpoint.expectedStructure) {
      return {
        endpointName: endpoint.name,
        method: endpoint.method,
        success: true,
        isCritical: false,
        statusCode: status,
        errorMessage: null,
        missingFields: [],
        extraFields: [],
        typeMismatches: [],
        updatedStructure: null,
      };
    }

    // 6) Erwartete Struktur laden
    const expectedPath = resolveProjectPath(endpoint.expectedStructure);
    let expected: unknown = {};
    if (existsSync(expectedPath)) {
      const txt = await Deno.readTextFile(expectedPath);
      expected = JSON.parse(txt);
    } else {
      console.warn(`⚠️ Missing expected file: ${expectedPath}`);
    }

    // 7) Vergleichen
    const transformed = transformValues(responseData);
    const { missingFields, extraFields, typeMismatches } = compareStructures(
      expected,
      transformed,
    );
    const hasDiff = missingFields.length > 0 ||
      extraFields.length > 0 ||
      typeMismatches.length > 0;

    let updatedStructure: string | null = null;
    if (hasDiff) {
      // 8) Neue Struktur speichern
      const baseName = endpoint.name.replace(/\s+/g, "_");
      const nextPath = getNextUpdatedPath(baseName);
      ensureFileSync(nextPath);
      await Deno.writeTextFile(
        nextPath,
        JSON.stringify(transformed, null, 2),
      );
      console.log(`📄 Saved updated structure: ${nextPath}`);
      updatedStructure = basename(nextPath);

      // 9) Falls genehmigt: in config übernehmen
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
              const cfgPath = resolveProjectPath("config.json");
              await Deno.writeTextFile(
                cfgPath,
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

    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success: !hasDiff,
      isCritical: false,
      statusCode: status,
      errorMessage: null,
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
      missingFields: [],
      extraFields: [],
      typeMismatches: [],
      updatedStructure: null,
    };
  }
}
