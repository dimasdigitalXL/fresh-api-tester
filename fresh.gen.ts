// DO NOT EDIT. This file is generated by Fresh.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running `dev.ts`.

import * as $_404 from "./routes/_404.tsx";
import * as $_app from "./routes/_app.tsx";
import * as $api_cron_log_stream from "./routes/api/cron-log-stream.ts";
import * as $api_cron_log from "./routes/api/cron-log.ts";
import * as $api_get_config_endpoints from "./routes/api/get-config-endpoints.ts";
import * as $api_get_endpoint_expected from "./routes/api/get-endpoint-expected.ts";
import * as $api_get_route_details from "./routes/api/get-route-details.ts";
import * as $api_get_routes from "./routes/api/get-routes.ts";
import * as $api_kv_dump from "./routes/api/kv-dump.ts";
import * as $api_reset_approvals from "./routes/api/reset-approvals.ts";
import * as $api_reset_expected from "./routes/api/reset-expected.ts";
import * as $api_reset_pending from "./routes/api/reset-pending.ts";
import * as $api_run_tests from "./routes/api/run-tests.ts";
import * as $api_slack_stream from "./routes/api/slack-stream.ts";
import * as $api_slack from "./routes/api/slack.ts";
import * as $api_test_kv from "./routes/api/test-kv.ts";
import * as $greet_name_ from "./routes/greet/[name].tsx";
import * as $index from "./routes/index.tsx";
import * as $CompareIsland from "./islands/CompareIsland.tsx";
import * as $Counter from "./islands/Counter.tsx";
import * as $DashboardIsland from "./islands/DashboardIsland.tsx";
import * as $EndpointsIsland from "./islands/EndpointsIsland.tsx";
import * as $LastRunIsland from "./islands/LastRunIsland.tsx";
import * as $LogIsland from "./islands/LogIsland.tsx";
import * as $RoutesIsland from "./islands/RoutesIsland.tsx";
import * as $RunTestsIsland from "./islands/RunTestsIsland.tsx";
import * as $SlackDebugEventsIsland from "./islands/SlackDebugEventsIsland.tsx";
import type { Manifest } from "$fresh/server.ts";

const manifest = {
  routes: {
    "./routes/_404.tsx": $_404,
    "./routes/_app.tsx": $_app,
    "./routes/api/cron-log-stream.ts": $api_cron_log_stream,
    "./routes/api/cron-log.ts": $api_cron_log,
    "./routes/api/get-config-endpoints.ts": $api_get_config_endpoints,
    "./routes/api/get-endpoint-expected.ts": $api_get_endpoint_expected,
    "./routes/api/get-route-details.ts": $api_get_route_details,
    "./routes/api/get-routes.ts": $api_get_routes,
    "./routes/api/kv-dump.ts": $api_kv_dump,
    "./routes/api/reset-approvals.ts": $api_reset_approvals,
    "./routes/api/reset-expected.ts": $api_reset_expected,
    "./routes/api/reset-pending.ts": $api_reset_pending,
    "./routes/api/run-tests.ts": $api_run_tests,
    "./routes/api/slack-stream.ts": $api_slack_stream,
    "./routes/api/slack.ts": $api_slack,
    "./routes/api/test-kv.ts": $api_test_kv,
    "./routes/greet/[name].tsx": $greet_name_,
    "./routes/index.tsx": $index,
  },
  islands: {
    "./islands/CompareIsland.tsx": $CompareIsland,
    "./islands/Counter.tsx": $Counter,
    "./islands/DashboardIsland.tsx": $DashboardIsland,
    "./islands/EndpointsIsland.tsx": $EndpointsIsland,
    "./islands/LastRunIsland.tsx": $LastRunIsland,
    "./islands/LogIsland.tsx": $LogIsland,
    "./islands/RoutesIsland.tsx": $RoutesIsland,
    "./islands/RunTestsIsland.tsx": $RunTestsIsland,
    "./islands/SlackDebugEventsIsland.tsx": $SlackDebugEventsIsland,
  },
  baseUrl: import.meta.url,
} satisfies Manifest;

export default manifest;
