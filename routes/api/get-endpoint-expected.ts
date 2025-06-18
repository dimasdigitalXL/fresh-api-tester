// routes/api/get-endpoint-expected.ts
import { Handlers } from "$fresh/server.ts";
import config from "../../src/api-tester/config.json" with { type: "json" };

export const handler: Handlers = {
  async GET(req, _ctx) {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(JSON.stringify({ error: "Missing name" }), {
        status: 400,
      });
    }
    // Finde den Config-Eintrag
    const entry = Array.isArray(config.endpoints)
      ? config.endpoints.find((e) => e.name === name)
      : undefined;
    if (!entry || !entry.expectedStructure) {
      return new Response(
        JSON.stringify({ error: "No expectedStructure for this endpoint" }),
        { status: 404 },
      );
    }
    try {
      // Lese Datei aus dem expected-Ordner
      const text = await Deno.readTextFile(
        `src/api-tester/${entry.expectedStructure}`,
      );
      const data = JSON.parse(text);
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Could not read expected file",
          detail: String(e),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
