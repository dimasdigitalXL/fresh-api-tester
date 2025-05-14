import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

// Funktion, um einen bestimmten Endpunkt zu testen
export async function runTestSingle(endpointName: string): Promise<void> {
  const cfg = await loadConfig();

  // Suche nach dem angegebenen Endpunkt
  const endpoint = cfg.endpoints.find((ep) => ep.name === endpointName);

  if (!endpoint) {
    console.error(
      `Endpunkt mit dem Namen "${endpointName}" wurde nicht gefunden.`,
    );
    return;
  }

  // Version Updates und Test Resultate vorbereiten
  const versionUpdates: VersionUpdate[] = [];
  const results: TestResult[] = [];

  // Teste den einzelnen Endpunkt
  const res = await runSingleEndpoint(endpoint, cfg, versionUpdates);
  if (res) {
    results.push(res);
  }

  // Sende den Slack-Report für diesen einzelnen Test
  await sendSlackReport(results, versionUpdates);
}

// Skript direkt ausführbar machen, z.B. mit "deno run -A run-test-single.ts"
if (import.meta.main) {
  const endpointName = Deno.args[0]; // Endpunktname als Argument übergeben
  if (!endpointName) {
    console.error(
      "Bitte einen Endpunktnamen angeben, z.B. 'Get List Purchase Orders'",
    );
    Deno.exit(1);
  }
  await runTestSingle(endpointName);
}
