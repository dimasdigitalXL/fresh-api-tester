import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

export const handler: Handlers = {
  async GET() {
    const deletedKeys: string[] = [];
    for await (const entry of kvInstance.list({ prefix: ["expected"] })) {
      const [, key] = entry.key;
      deletedKeys.push(String(key));
      await kvInstance.delete(entry.key);
    }
    // Nur noch data zurückgeben
    return new Response(
      JSON.stringify({ data: { deletedKeys } }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
