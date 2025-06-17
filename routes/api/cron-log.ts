// routes/api/cron-log.ts
import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET(_req, _ctx) {
    // Liest den Zeitstempel aus KV; key ist ["lastCronRun"]
    const entry = await kvInstance.get<string>(["lastCronRun"]);
    const lastRun = entry.value ?? null;
    return new Response(
      JSON.stringify({ lastRun }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
