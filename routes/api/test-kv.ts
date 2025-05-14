// routes/api/test-kv.ts

import type { Handlers } from "$fresh/server.ts";
// ① korrekter Import der Kv-Instanz
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    // ② warte auf die Instanz
    const kv = await kvInstance;
    // ③ lese den Test-Wert
    const { value: stored } = await kv.get<string>(["test", "key"]);
    // ④ gib JSON zurück
    return new Response(
      JSON.stringify({ key: ["test", "key"], stored }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
