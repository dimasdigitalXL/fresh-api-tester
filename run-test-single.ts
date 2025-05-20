#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

// run-test-single.ts

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
 * den HTTP-Status, den Strukturvergleich und – NEU –
 * den erwarteten vs. tatsächlichen JSON-Body aus.
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

  // 4) Terminal-Ausgabe Grunddaten
  console.log(`\n=== Test Single: "${endpoint.name}" ===`);
  console.log(`HTTP-Status:      ${res.statusCode}`);
  console.log(`Erfolg:           ${res.success ? "✅ OK" : "❌ FEHLER"}`);

  // 5) Struktur-Vergleich
  if (endpoint.expectedStructure) {
    console.log("\n--- Struktur-Vergleich ---");
    console.log(`Erwartete Datei:  ${res.expectedFile}`);

    console.log(
      res.expectedMissing
        ? "⚠️ Erwartete Datei fehlt!"
        : "✅ Erwartete Datei vorhanden",
    );

    console.log(
      res.missingFields.length > 0
        ? `❌ Fehlende Felder:    ${res.missingFields.join(", ")}`
        : "✅ Fehlende Felder:    keine",
    );
    console.log(
      res.extraFields.length > 0
        ? `➕ Zusätzliche Felder: ${res.extraFields.join(", ")}`
        : "✅ Zusätzliche Felder: keine",
    );
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

    // 6) NEU: JSON-Vergleichsausgabe
    console.log("\n--- Erwartetes JSON (parsed) ---");
    if (res.expectedData !== undefined) {
      console.log(JSON.stringify(res.expectedData, null, 2));
    } else {
      console.log("⚠️ Kein erwartetes JSON geladen (Datei fehlt).");
    }

    console.log("\n--- Tatsächliche JSON (parsed) ---");
    console.log(JSON.stringify(res.actualData, null, 2));
  } else {
    console.log(
      "\nℹ️ Kein erwartetes Schema definiert, daher kein Strukturvergleich möglich.",
    );
    console.log("\n--- Tatsächliche JSON (parsed) ---");
    console.log(JSON.stringify(res.actualData, null, 2));
  }

  // 7) Slack-Report senden (echter Modus)
  await sendSlackReport(results, versionUpdates);
}

if (import.meta.main) {
  const endpointName = Deno.args[0];
  if (!endpointName) {
    console.error(
      "Bitte einen Endpunktnamen angeben, z.B. 'Get View Customer'",
    );
    Deno.exit(1);
  }
  await runTestSingle(endpointName);
}
