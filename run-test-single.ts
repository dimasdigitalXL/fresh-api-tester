#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

/**
 * Führt genau einen Endpoint-Test aus, gibt im Terminal
 * den HTTP-Status und den Strukturvergleich aus und
 * sendet anschließend den Slack-Report (immer im echten Modus).
 */
export async function runTestSingle(endpointName: string): Promise<void> {
  const cfg = await loadConfig();

  // 1) Endpunkt in der Konfiguration finden
  const endpoint = cfg.endpoints.find((ep) => ep.name === endpointName);
  if (!endpoint) {
    console.error(
      `✋ Endpunkt mit dem Namen "${endpointName}" wurde nicht gefunden.`,
    );
    Deno.exit(1);
  }

  // 2) Version-Updates und Test-Ergebnisse sammeln
  const versionUpdates: VersionUpdate[] = [];
  const results: TestResult[] = [];

  // 3) Einzelnen Endpunkt testen
  const res = await runSingleEndpoint(endpoint, cfg, versionUpdates);
  if (!res) {
    console.error("⚠️ Kein Ergebnis vom Testlauf erhalten.");
    Deno.exit(1);
  }
  results.push(res);

  // 4) Terminal-Ausgabe
  console.log(`\n=== Test Single: "${endpoint.name}" ===`);
  console.log(`HTTP-Status:      ${res.statusCode}`);
  console.log(`Erfolg:           ${res.success ? "✅ OK" : "❌ FEHLER"}`);

  if (endpoint.expectedStructure) {
    console.log("\n--- Struktur-Vergleich ---");
    console.log(`Erwartete Datei:  ${endpoint.expectedStructure}`);

    if (res.missingFields.length > 0) {
      console.log(`❌ Fehlende Felder:    ${res.missingFields.join(", ")}`);
    } else {
      console.log("✅ Fehlende Felder:    keine");
    }

    if (res.extraFields.length > 0) {
      console.log(`➕ Zusätzliche Felder: ${res.extraFields.join(", ")}`);
    } else {
      console.log("✅ Zusätzliche Felder: keine");
    }

    if (res.typeMismatches.length > 0) {
      console.log("⚠️ Typ-Abweichungen:");
      for (const m of res.typeMismatches) {
        console.log(
          `   • ${m.path}: erwartet ${m.expected}, erhalten ${m.actual}`,
        );
      }
    } else {
      console.log("✅ Typ-Abweichungen:   keine");
    }
  } else {
    console.log(
      "\nℹ️ Kein erwartetes Schema definiert, daher kein Strukturvergleich möglich.",
    );
  }

  // 5) Slack-Report senden (echter Modus, da dryRun default false)
  await sendSlackReport(results, versionUpdates);
}

if (import.meta.main) {
  const endpointName = Deno.args[0];
  if (!endpointName) {
    console.error(
      "Bitte einen Endpunktnamen angeben, z.B. 'Get List Purchase Orders'",
    );
    Deno.exit(1);
  }
  await runTestSingle(endpointName);
}
