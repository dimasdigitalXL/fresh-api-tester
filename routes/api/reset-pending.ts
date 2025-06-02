// routes/api/reset-pending.ts

import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    try {
      // 1) Lösche das gesamte pendingUpdates-Array
      await kvInstance.delete(["pendingUpdates"]);

      return new Response(
        JSON.stringify({
          ok: true,
          message: "pendingUpdates erfolgreich gelöscht",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Fehler beim Zurücksetzen von pendingUpdates:", msg);
      return new Response(
        JSON.stringify({ ok: false, message: msg }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
