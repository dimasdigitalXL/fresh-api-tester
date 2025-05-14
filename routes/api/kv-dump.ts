// routes/api/kv-dump.ts

import type { Handlers } from "$fresh/server.ts";
// vorher: import { kv } from "../../src/api-tester/core/kv.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    const kv = await kvInstance;
    const approvals =
      (await kv.get<Record<string, string>>(["approvals"])).value ?? {};
    const rawBlocks =
      (await kv.get<Record<string, unknown[]>>(["rawBlocks"])).value ?? {};
    return new Response(
      JSON.stringify({ approvals, rawBlocks }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
