// routes/api/kv-dump.ts
import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    // 1) approvals + rawBlocks
    const { value: approvals = {} } = await kvInstance.get<
      Record<string, string>
    >(["approvals"]);
    const { value: rawBlocks = {} } = await kvInstance.get<
      Record<string, unknown>
    >(["rawBlocks"]);

    // 2) alle pending-Schemas auflisten
    const pending: Record<string, unknown>[] = [];
    for await (
      const en of kvInstance.list({ prefix: ["schema-update-pending"] })
    ) {
      const key = en.key[1] as string;
      pending.push({ key, schema: en.value });
    }

    // 3) alle live-Schemas (expected) auflisten
    const expected: Record<string, unknown>[] = [];
    for await (const en of kvInstance.list({ prefix: ["expected"] })) {
      const key = en.key[1] as string;
      expected.push({ key, schema: en.value });
    }

    const body = { approvals, rawBlocks, pending, expected };
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
