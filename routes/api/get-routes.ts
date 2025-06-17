// routes/api/get-routes.ts
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(_req, _ctx) {
    const apiDir = new URL(".", import.meta.url);
    const routes: string[] = [];

    for await (const entry of Deno.readDir(apiDir)) {
      if (
        entry.isFile &&
        entry.name.endsWith(".ts") &&
        entry.name !== "get-routes.ts" &&
        entry.name !== "get-route-details.ts" &&
        !entry.name.endsWith("-stream.ts")
      ) {
        const name = entry.name.slice(0, -3);
        routes.push(`/api/${name}`);
      }
    }

    return new Response(
      JSON.stringify({ routes }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
