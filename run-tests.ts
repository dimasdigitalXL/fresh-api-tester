// run-tests.ts

/**
 * Orchestriert alle API-Tests, sendet das Ergebnis nach Slack
 * und pusht neue Schemas ins Git-Repository.
 *
 * Usage:
 *   deno run --unstable-kv -A run-tests.ts
 *   deno run --unstable-kv -A run-tests.ts --dry-run
 *
 * ENV:
 *   DRY_RUN=true        # aktiviert Dry-Run (Slack-Payload in Konsole)
 *   DISABLE_SLACK=true  # überspringt komplettes Slack-Reporting
 */
import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import type { SchemaUpdate } from "./src/api-tester/core/gitPush.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import { pushExpectedSchemaToGit } from "./src/api-tester/core/gitPush.ts";

interface RunOptions {
  dryRun?: boolean;
}

export async function runAllTests({ dryRun = false }: RunOptions = {}) {
  console.log("▶️ run-tests.ts: starte Batch-Durchlauf");

  // 1) Config + GitRepo laden
  const cfg = await loadConfig();
  console.log("🔧 Geladene Endpoints:", cfg.endpoints.map((e) => e.name));

  // 2) Arrays für Version- und Schema-Updates
  const versionUpdates: VersionUpdate[] = [];
  const schemaUpdates: SchemaUpdate[] = [];
  const results: TestResult[] = [];

  // 3) Jeden Endpoint testen
  for (const ep of cfg.endpoints) {
    const res = await runSingleEndpoint(
      ep,
      cfg,
      versionUpdates,
      schemaUpdates,
    );
    if (res) {
      results.push(res);
    }
  }

  console.log(`▶️ run-tests.ts: Tests abgeschlossen. Dry-Run=${dryRun}`);

  // 4) Slack-Reporting
  const disableSlack = Deno.env.get("DISABLE_SLACK") === "true";
  if (dryRun || Deno.env.get("DRY_RUN") === "true") {
    console.log("📣 --- Slack-Payload (Dry-Run) ---");
    console.log(JSON.stringify({ results, versionUpdates }, null, 2));
  } else if (!disableSlack) {
    console.log("📨 sende Slack-Report …");
    await sendSlackReport(results, versionUpdates);
  } else {
    console.log("⚠️ Slack-Reporting deaktiviert (DISABLE_SLACK=true)");
  }

  // 5) Neue/geänderte expected-Schemas ins Git pushen
  if (schemaUpdates.length > 0) {
    console.log(
      `🔀 Push ${schemaUpdates.length} Schema-Updates an Git ${cfg.gitRepo.owner}/${cfg.gitRepo.repo}@${cfg.gitRepo.branch}`,
    );
    await pushExpectedSchemaToGit(cfg.gitRepo, schemaUpdates);
  } else {
    console.log("✅ Keine Schema-Updates vorhanden, kein Git-Push nötig.");
  }
}

if (import.meta.main) {
  const dryRunFlag = Deno.args.includes("--dry-run") ||
    Deno.env.get("DRY_RUN") === "true";
  await runAllTests({ dryRun: dryRunFlag });
}
