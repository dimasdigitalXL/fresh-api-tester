// run-tests.ts
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";

export async function runAllTests(): Promise<void> {
  const cfg = await loadConfig();

  // Statt any[] jetzt VersionUpdate[]
  const versionUpdates: VersionUpdate[] = [];
  // Ergebnisse als TestResult[]
  const results: TestResult[] = [];

  for (const ep of cfg.endpoints) {
    const res = await runSingleEndpoint(ep, cfg, versionUpdates);
    if (res) {
      results.push(res);
    }
  }

  await sendSlackReport(results, versionUpdates);
}

// Skript direkt ausführbar machen
if (import.meta.main) {
  await runAllTests();
}