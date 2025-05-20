// scripts/debugReport.ts

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { sendSlackReport } from "../src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import type { TestResult } from "../src/api-tester/core/apiCaller.ts";
import type { VersionUpdate } from "../src/api-tester/core/slack/slackReporter/sendSlackReport.ts";

const fakeResults: TestResult[] = [
  {
    endpointName: "FooEndpoint",
    method: "GET",
    success: false,
    isCritical: true,
    statusCode: 500,
    errorMessage: "Simulierter Fehler",
    missingFields: [],
    extraFields: [],
    typeMismatches: [],
    updatedStructure: "FooEndpoint",
    expectedFile: "./expected/FooEndpoint.json",
    expectedMissing: false,
    expectedData: { foo: "string" },
    actualData: { foo: "bar" },
  },
];

// explicit type annotation hier:
const fakeVersions: VersionUpdate[] = [];

await sendSlackReport(fakeResults, fakeVersions);
