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
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { loadExpectedSchema } from "./src/api-tester/core/structureAnalyzer.ts";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";

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
  console.log(`HTTP-Status:      ${res.status}`);
  const hasIssues = res.expectedMissing ||
    res.missingFields.length > 0 ||
    res.extraFields.length > 0 ||
    res.typeMismatches.length > 0;
  console.log(`Erfolg:           ${hasIssues ? "❌ FEHLER" : "✅ OK"}`);

  // 6) Strukturvergleich und JSON-Ausgabe
  if (endpoint.expectedStructure || !res.expectedMissing) {
    console.log("\n--- Struktur-Vergleich ---");
    if (res.expectedMissing) {
      console.log(`⚠️ Erwartete Datei fehlt! (${res.expectedFile})`);
    } else {
      console.log(`Erwartete Datei:  ${res.expectedFile}`);
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
    }

    // 6a) Erwartetes JSON einlesen (falls vorhanden)
    console.log("\n--- Erwartetes JSON (parsed) ---");
    if (!res.expectedMissing && res.expectedFile) {
      try {
        // Pfad ermitteln
        const expectedPath = endpoint.expectedStructure
          ? join(Deno.cwd(), "src", "api-tester", endpoint.expectedStructure)
          : await (async () => {
            // Suche erste passende Datei
            const key = endpoint.name.replace(/\s+/g, "_");
            const expectedDir = join(
              Deno.cwd(),
              "src",
              "api-tester",
              "expected",
            );
            for await (const entry of Deno.readDir(expectedDir)) {
              if (!entry.isFile) continue;
              if (entry.name.startsWith(key) && entry.name.endsWith(".json")) {
                return join(expectedDir, entry.name);
              }
            }
            throw new Error("Erwartete Datei nicht gefunden");
          })();
        if (existsSync(expectedPath)) {
          const expectedSchema = await loadExpectedSchema(
            endpoint.name.replace(/\s+/g, "_"),
            expectedPath,
          );
          console.log(JSON.stringify(expectedSchema, null, 2));
        } else {
          console.log(
            "⚠️ Erwartete Datei existiert nicht auf dem Dateisystem.",
          );
        }
      } catch {
        console.log("⚠️ Kein erwartetes JSON geladen.");
      }
    } else {
      console.log("⚠️ Kein erwartetes JSON geladen.");
    }

    // 6b) Tatsächliche JSON ausgeben
    console.log("\n--- Tatsächliche JSON (parsed) ---");
    if (res.actualData !== undefined) {
      console.log(JSON.stringify(res.actualData, null, 2));
    } else {
      console.log("⚠️ Keine tatsächliche JSON-Daten verfügbar.");
    }
  } else {
    console.log(
      "\nℹ️ Kein erwartetes Schema definiert – nur tatsächliches JSON:",
    );
    if (res.actualData !== undefined) {
      console.log(JSON.stringify(res.actualData, null, 2));
    } else {
      console.log("⚠️ Keine tatsächliche JSON-Daten verfügbar.");
    }
  }

  // 7) Slack-Report senden (außer DISABLE_SLACK=true)
  const disableSlack = Deno.env.get("DISABLE_SLACK") === "true";
  if (disableSlack) {
    console.log("⚠️ Slack-Reporting deaktiviert (DISABLE_SLACK=true)");
  } else {
    await sendSlackReport(results, versionUpdates);
  }

  // 8) Exit-Code: 0 bei Erfolg, 1 bei Fehler
  Deno.exit(hasIssues ? 1 : 0);
}

if (import.meta.main) {
  const endpointName = Deno.args[0];
  if (!endpointName) {
    console.error("Bitte Endpoint-Name angeben, z.B. `Get View Customer`");
    Deno.exit(1);
  }
  await runTestSingle(endpointName);
}
