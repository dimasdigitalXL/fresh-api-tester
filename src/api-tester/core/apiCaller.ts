import axios from "https://esm.sh/axios@1.4.0";
import {
  ensureFileSync,
  existsSync,
} from "https://deno.land/std@0.216.0/fs/mod.ts";
import { basename } from "https://deno.land/std@0.216.0/path/mod.ts";
import { getNextUpdatedPath, transformValues } from "./structureAnalyzer.ts";
import { compareStructures } from "./compareStructures.ts";
import { resolveProjectPath } from "./utils.ts";
import { getSlackWorkspaces } from "./slack/slackWorkspaces.ts"; // Korrekt importiert

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
  _config?: { endpoints: Endpoint[] },
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

    // 3) Request ausführen
    console.log(`🔄 Anfrage an: ${url}${qs}`); // Logge die angeforderte URL

    const resp = await axios.request({
      url: `${url}${qs}`,
      method: endpoint.method,
      data: undefined, // Hier wird data korrekt initialisiert
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

    console.log(`🚀 Antwort von ${endpoint.name}:`, responseData); // Logge die API-Antwort

    // 4) Kein expectedStructure → skip
    if (!endpoint.expectedStructure) {
      console.warn(`⚠️ Kein expectedStructure für ${endpoint.name} gefunden!`);
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

    // 5) Erwartete Struktur laden
    const expectedPath = resolveProjectPath(endpoint.expectedStructure);
    let expected: unknown = {};
    if (existsSync(expectedPath)) {
      const txt = await Deno.readTextFile(expectedPath);
      expected = JSON.parse(txt);
    } else {
      console.warn(`⚠️ Fehlende erwartete Datei: ${expectedPath}`);
    }

    // 6) Vergleichen
    const transformed = transformValues(responseData);
    const { missingFields, extraFields, typeMismatches } = compareStructures(
      expected,
      transformed,
    );

    // 7) Wenn Unterschiede gefunden, logge sie
    if (missingFields.length || extraFields.length || typeMismatches.length) {
      console.log(`🔴 Unterschiede gefunden bei ${endpoint.name}:`);
      console.log("Fehlende Felder:", missingFields);
      console.log("Zusätzliche Felder:", extraFields);
      console.log("Typabweichungen:", typeMismatches);
    }

    let updatedStructure: string | null = null;
    if (missingFields.length || extraFields.length || typeMismatches.length) {
      // 8) Neue Struktur speichern, falls Unterschiede
      const baseName = endpoint.name.replace(/\s+/g, "_");
      const nextPath = getNextUpdatedPath(baseName);
      ensureFileSync(nextPath);
      await Deno.writeTextFile(nextPath, JSON.stringify(transformed, null, 2));
      console.log(`📄 Neue Struktur gespeichert: ${nextPath}`);
      updatedStructure = basename(nextPath);
    }

    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success:
        !(missingFields.length || extraFields.length || typeMismatches.length),
      isCritical: false,
      statusCode: status,
      errorMessage: null,
      missingFields,
      extraFields,
      typeMismatches,
      updatedStructure,
    };
  } catch (err) {
    console.error(`❌ Fehler bei ${endpoint.name}:`, err);
    // Sende eine Slack-Nachricht über den Fehler
    await sendSlackErrorReport(
      endpoint,
      err instanceof Error ? err.message : String(err),
    );
    return {
      endpointName: endpoint.name,
      method: endpoint.method,
      success: false,
      isCritical: true,
      statusCode: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      missingFields: [],
      extraFields: [],
      typeMismatches: [],
      updatedStructure: null,
    };
  }
}

async function sendSlackErrorReport(endpoint: Endpoint, errorMessage: string) {
  const workspaces = getSlackWorkspaces();
  const text =
    `❌ Fehler bei API-Aufruf: *${endpoint.name}* (${endpoint.method})\n\nFehler: ${errorMessage}`;

  for (const { token, channel } of workspaces) {
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel,
        text,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
  }
  console.log("📩 Fehlerbericht an Slack gesendet.");
}
