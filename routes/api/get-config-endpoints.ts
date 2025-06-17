// routes/api/get-config-endpoints.ts
import { Handlers } from "$fresh/server.ts";
// Deno v1.28+: import attributes mit 'with'
import config from "../../src/api-tester/config.json" with { type: "json" };

export const handler: Handlers = {
  GET() {
    // Aus deinem config.json-Shape { endpoints: [...] } das Array ziehen
    const endpoints: string[] = Array.isArray(config.endpoints)
      ? config.endpoints.map((e) => e.name)
      : [];

    return new Response(
      JSON.stringify({ data: endpoints }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
};
