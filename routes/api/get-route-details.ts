// routes/api/get-route-details.ts
import { Handlers } from "$fresh/server.ts";
import { testRoute } from "../../lib/apiTester.ts";

export const handler: Handlers = {
  async GET(req, _ctx) {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(
        JSON.stringify({ error: "Parameter ‚name‘ fehlt" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const result = await testRoute(name);
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: `Test fehlgeschlagen: ${message}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
