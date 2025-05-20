// routes/api/reset-approvals.ts

import { Handlers } from "$fresh/server.ts";
import { resetApprovalsKV } from "../../src/api-tester/core/resetApprovals.ts";

export const handler: Handlers = {
  async GET() {
    await resetApprovalsKV();
    return new Response("OK: approvals in KV zurückgesetzt", { status: 200 });
  },
};
