// routes/api/reset-pending.ts

import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    // 1) Lösch den einzelnen pending-Array-Eintrag (falls vorhanden)
    await kvInstance.delete(["pending"]);

    // 2) Falls du zusätzlich mit schema-prefix gearbeitet hast, alle Einträge unter diesem Prefix löschen
    for await (
      const entry of kvInstance.list({ prefix: ["schema-update-pending"] })
    ) {
      await kvInstance.delete(entry.key);
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Pending cleared" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
