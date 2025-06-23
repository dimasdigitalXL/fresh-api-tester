// routes/api/get-endpoint-expected.ts
import { Handlers } from "$fresh/server.ts";
// Deno v1.28+: import attributes mit 'with'
import config from "../../src/api-tester/config.json" with { type: "json" };

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    const version = (url.searchParams.get("version") ?? "new").toLowerCase();

    if (!name) {
      return new Response(
        JSON.stringify({ error: "Missing `name` parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Finde den passenden Config-Eintrag
    const entry = Array.isArray(config.endpoints)
      ? config.endpoints.find((e) => e.name === name)
      : undefined;

    if (!entry?.expectedStructure) {
      return new Response(
        JSON.stringify({
          error: `No expectedStructure for endpoint "${name}"`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Ursprünglicher Pfad aus config
    let filePath = `src/api-tester/${entry.expectedStructure}`;

    // Bei ?version=old die ältere Variante ermitteln
    if (version === "old") {
      filePath = resolveOldVersionPath(filePath);
    }

    try {
      const text = await Deno.readTextFile(filePath);
      const data = JSON.parse(text);
      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: `Could not read "${filePath}"`,
          detail: String(e),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};

/**
 * Erzeugt aus z.B.
 *   "…_updated_v2.json" → "…_updated_v1.json"
 *   "…_updated_v1.json" → "…_updated.json"
 *   "…_updated.json"    → "….json"
 * Sonst: Pfad unverändert zurück.
 */
function resolveOldVersionPath(path: string): string {
  const parts = path.split("/");
  const file = parts.pop()!;

  // Match auf …_updated_vX.json
  const m = file.match(/(.+)_updated_v(\d+)\.json$/);
  if (m) {
    const base = m[1];
    const ver = parseInt(m[2], 10);
    if (ver > 1) {
      parts.push(`${base}_updated_v${ver - 1}.json`);
    } else {
      parts.push(`${base}_updated.json`);
    }
    return parts.join("/");
  }

  // Match auf …_updated.json
  if (file.endsWith("_updated.json")) {
    parts.push(file.replace(/_updated\.json$/, ".json"));
    return parts.join("/");
  }

  // Kein Suffix → Fallback
  parts.push(file);
  return parts.join("/");
}
