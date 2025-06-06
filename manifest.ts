// src/manifest.ts

import { Manifest } from "$fresh/server.ts";
import * as $_404 from "./routes/_404.tsx";
import * as $_app from "./routes/_app.tsx";
import * as $api_resetApprovals from "./routes/api/reset-approvals.ts";
import * as $api_resetExpected from "./routes/api/reset-expected.ts";
import * as $api_resetPending from "./routes/api/reset-pending.ts";
import * as $api_runTests from "./routes/api/run-tests.ts";
import * as $api_kvDump from "./routes/api/kv-dump.ts";
import * as $api_slack from "./routes/api/slack.ts";
import * as $api_testKv from "./routes/api/test-kv.ts";
import * as $greet_name from "./routes/greet/[name].tsx";
import * as $index from "./routes/index.tsx";
import * as $Counter from "./islands/Counter.tsx";

const manifest: Manifest = {
  routes: {
    "./routes/_404.tsx": $_404,
    "./routes/_app.tsx": $_app,
    "./routes/api/reset-approvals.ts": $api_resetApprovals,
    "./routes/api/reset-expected.ts": $api_resetExpected,
    "./routes/api/reset-pending.ts": $api_resetPending,
    "./routes/api/run-tests.ts": $api_runTests,
    "./routes/api/kv-dump.ts": $api_kvDump,
    "./routes/api/slack.ts": $api_slack,
    "./routes/api/test-kv.ts": $api_testKv,
    "./routes/greet/[name].tsx": $greet_name,
    "./routes/index.tsx": $index,
  },
  islands: {
    "./islands/Counter.tsx": $Counter,
  },
  baseUrl: import.meta.url,
};

export default manifest;
