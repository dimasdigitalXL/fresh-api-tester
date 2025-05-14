// run-tests.ts

// 1) Lade deine Env-Variablen via URL-Import (nicht via $std)
import "https://deno.land/std@0.216.0/dotenv/load.ts";

import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

export async function runAllTests(): Promise<void> {
  console.log("▶️ run-tests.ts: starte Batch-Durchlauf");

  // 2) Config laden
  const cfg = await loadConfig();
  console.log("🔧 Endpunkte:", cfg.endpoints.map((e) => e.name));

  const versionUpdates: VersionUpdate[] = [];
  const results: TestResult[] = [];

  // 3) Jeden Endpoint testen
  for (const ep of cfg.endpoints) {
    const res = await runSingleEndpoint(ep, cfg, versionUpdates);
    if (res) results.push(res);
  }

  console.log("▶️ run-tests.ts: Tests fertig, sende Slack-Report");
  await sendSlackReport(results, versionUpdates);
  console.log("✅ run-tests.ts: Batch-Durchlauf abgeschlossen");
}

if (import.meta.main) {
  await runAllTests();
}
