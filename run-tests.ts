#!/usr/bin/env -S deno run -A --watch=src/**,src/api-tester/config.json

import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import { resetApprovals } from "./src/api-tester/core/resetApprovals.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";

async function main() {
  if (!Deno.env.get("SKIP_RESET_APPROVALS")) {
    await resetApprovals();
  }

  const { endpoints } = await loadConfig();
  const versionUpdates: VersionUpdate[] = [];
  const results = [];

  for (const ep of endpoints) {
    const res = await runSingleEndpoint(ep, { endpoints }, versionUpdates);
    if (res) results.push(res);
  }

  await sendSlackReport(
    results,
    versionUpdates.map(({ name, url, expectedStructure }) => ({
      name,
      url,
      expectedStructure,
    })),
    { dryRun: false },
  );

  Deno.exit(0);
}

if (import.meta.main) await main();
