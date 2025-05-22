#!/usr/bin/env -S deno run --unstable --allow-read --allow-net --allow-env

// run-test-single.ts

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import type { SchemaUpdate } from "./src/api-tester/core/gitPush.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

/**
 * Führt genau einen Endpoint-Test aus, gibt im Terminal
 * HTTP-Status, Strukturvergleich und JSON-Output aus
 * und schickt den Report an Slack.
 */
export async function runTestSingle(endpointName: string): Promise<void> {
  // 1) Config laden
  const cfg = await loadConfig();
  console.log("🔧 Geladene Endpoints:", cfg.endpoints.map((e) => e.name));

  // 2) Gewünschten Endpoint finden
  const endpoint = cfg.endpoints.find((ep) => ep.name === endpointName);
  if (!endpoint) {
    console.error(
      `✋ Endpoint "${endpointName}" nicht in config.json gefunden.`,
    );
    Deno.exit(1);
  }

  // 3) Arrays für Versions- und Schema-Updates sowie Ergebnisse
  const versionUpdates: VersionUpdate[] = [];
  const schemaUpdates: SchemaUpdate[] = [];
  const results: TestResult[] = [];

  // 4) Testlauf
  const res = await runSingleEndpoint(
    endpoint,
    cfg,
    versionUpdates,
    schemaUpdates,
  );
  if (!res) {
    console.error(
      "⚠️ Kein Ergebnis: vermutlich wurde nur eine neue API-Version erkannt.",
    );
    Deno.exit(1);
  }
  results.push(res);

  // 5) Konsolen-Ausgabe
  console.log(`\n=== Test Single: "${endpoint.name}" ===`);
  console.log(`HTTP-Status:      ${res.statusCode}`);
  console.log(`Erfolg:           ${res.success ? "✅ OK" : "❌ FEHLER"}`);

  // 6) Strukturvergleich und JSON-Ausgabe
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

    console.log("\n--- Erwartetes JSON (parsed) ---");
    if (res.expectedData !== undefined) {
      console.log(JSON.stringify(res.expectedData, null, 2));
    } else {
      console.log("⚠️ Kein erwartetes JSON geladen.");
    }

    console.log("\n--- Tatsächliche JSON (parsed) ---");
    console.log(JSON.stringify(res.actualData, null, 2));
  } else {
    console.log(
      "\nℹ️ Kein erwartetes Schema definiert – nur tatsächliches JSON:",
    );
    console.log(JSON.stringify(res.actualData, null, 2));
  }

  // 7) Slack-Report senden (außer DISABLE_SLACK=true)
  const disableSlack = Deno.env.get("DISABLE_SLACK") === "true";
  if (disableSlack) {
    console.log("⚠️ Slack-Reporting deaktiviert (DISABLE_SLACK=true)");
  } else {
    await sendSlackReport(results, versionUpdates);
  }

  // 8) Exit-Code: 0 bei Erfolg, 1 bei Fehler
  Deno.exit(res.success ? 0 : 1);
}

if (import.meta.main) {
  const endpointName = Deno.args[0];
  if (!endpointName) {
    console.error("Bitte Endpoint-Name angeben, z.B. `Get View Customer`");
    Deno.exit(1);
  }
  await runTestSingle(endpointName);
}
