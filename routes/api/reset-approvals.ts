// routes/api/reset-approvals.ts

import { HandlerContext } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler = async (
  _req: Request,
  _ctx: HandlerContext,
): Promise<Response> => {
  try {
    // Setzt approvals komplett zurück (kein Lesen notwendig)
    await kvInstance.set(["approvals"], {});
    console.log("✅ Alle approvals in KV zurückgesetzt.");
    return new Response("OK: Approvals zurückgesetzt", { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Fehler beim Zurücksetzen der Approvals:", msg);
    return new Response(`Error: ${msg}`, { status: 500 });
  }
};
