// scripts/debugReport.ts
import { sendSlackReport } from "../src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "../src/api-tester/core/apiCaller.ts";

// Beispiel-Ergebnisse
const fakeResults: TestResult[] = [
  {
    endpointName: "Demo Endpoint",
    method: "GET",
    success: false,
    isCritical: true,
    statusCode: 500,
    errorMessage: null,
    missingFields: ["data.foo"],
    extraFields: [],
    typeMismatches: [],
    updatedStructure: "Demo_updated.json",
  },
];
const fakeVersions = [{ name: "Demo Endpoint", url: "https://api/v2/demo" }];

// Dry-Run: Verhindert echten Slack-Call
await sendSlackReport(fakeResults, fakeVersions, { dryRun: true });
console.log("✅ sendSlackReport dry-run durchgelaufen");
