import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    await kvInstance.set(["approvals"], {});
    // Nur noch data zurückgeben (hier leer)
    return new Response(
      JSON.stringify({ data: {} }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
