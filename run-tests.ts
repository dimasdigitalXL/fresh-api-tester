// run-tests.ts

/**
 * Orchestriert alle API-Tests und sendet das Ergebnis nach Slack.
 *
 * Usage:
 *   deno run -A run-tests.ts            # Normallauf (echt)
 *   deno run -A run-tests.ts --dry-run  # Dry-Run: Slack-Payload in der Konsole
 *
 * ENV:
 *   DRY_RUN=true        # aktiviert Dry-Run wenn kein Flag gesetzt
 *   DISABLE_SLACK=true  # überspringt komplettes Slack-Reporting
 */

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

interface RunOptions {
  dryRun?: boolean;
}

export async function runAllTests({ dryRun = false }: RunOptions = {}) {
  console.log("▶️ run-tests.ts: starte Batch-Durchlauf");

  // 1) Config laden
  const cfg = await loadConfig();
  console.log("🔧 Konfigurierte Endpunkte:", cfg.endpoints.map((e) => e.name));

  const versionUpdates: VersionUpdate[] = [];
  const results: TestResult[] = [];

  // 2) Jeden Endpoint testen
  for (const ep of cfg.endpoints) {
    const res = await runSingleEndpoint(ep, cfg, versionUpdates);
    if (res) results.push(res);
  }

  console.log(`▶️ run-tests.ts: Tests abgeschlossen. Dry-Run: ${dryRun}`);

  // 3) Slack-Reporting steuern
  const disableSlack = Deno.env.get("DISABLE_SLACK") === "true";
  if (dryRun || Deno.env.get("DRY_RUN") === "true") {
    console.log("📣 --- Slack-Payload (Dry-Run) ---");
    console.log(JSON.stringify({ results, versionUpdates }, null, 2));
  } else if (disableSlack) {
    console.log("⚠️ Slack-Reporting deaktiviert (DISABLE_SLACK=true)");
  } else {
    console.log("📨 sende Slack-Report …");
    await sendSlackReport(results, versionUpdates);
  }
}

if (import.meta.main) {
  const dryRunFlag = Deno.args.includes("--dry-run") ||
    Deno.env.get("DRY_RUN") === "true";
  await runAllTests({ dryRun: dryRunFlag });
}
