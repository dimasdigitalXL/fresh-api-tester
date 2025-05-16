// routes/api/cron-log.ts
import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET() {
    // Hier aus KV, Datei oder Umgebung lesen:
    const lastRun = Deno.env.get("LAST_CRON_RUN") ??
      new Date().toLocaleString("de-DE");
    return new Response(JSON.stringify({ lastRun }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
