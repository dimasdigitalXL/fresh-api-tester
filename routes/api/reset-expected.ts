// routes/api/reset-expected.ts
import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET(_, ctx) {
    const key = ctx.url.searchParams.get("key");
    if (!key) {
      return new Response("Missing ?key=...", { status: 400 });
    }
    await kvInstance.delete(["expected", key]);
    return new Response(`✅ KV-Entry ["expected","${key}"] gelöscht.`);
  },
};
