// lib/apiTester.ts
export interface TestResult {
  name: string;
  status: "OK" | "ERROR";
  statusCode: number;
  durationMs: number;
  data: Record<string, unknown>;
}

/**
 * Testet einen API-Endpunkt.
 * Erwartet, dass API_BASE_URL gesetzt ist.
 * Handhabt `name` mit oder ohne führenden Slash.
 */
export async function testRoute(name: string): Promise<TestResult> {
  const base = Deno.env.get("API_BASE_URL");
  if (!base) {
    throw new Error("Umgebungsvariable API_BASE_URL ist nicht gesetzt");
  }

  // Entferne abschließende Slashes von der Basis-URL
  const baseUrl = base.replace(/\/+$/, "");
  // Sorge dafür, dass der Pfad einen führenden Slash hat, aber keine URL-Encodierung für Slashes
  const path = name.startsWith("/") ? name : `/${name}`;
  const url = `${baseUrl}${path}`;

  const start = performance.now();
  const resp = await fetch(url);
  const durationMs = Math.round(performance.now() - start);

  // JSON-Antwort parsen als Record<string, unknown>
  let data: Record<string, unknown> = {};
  try {
    const parsed = await resp.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else {
      data = { value: parsed };
    }
  } catch {
    // Kein JSON-Body → data bleibt leer
  }

  return {
    name,
    status: resp.ok ? "OK" : "ERROR",
    statusCode: resp.status,
    durationMs,
    data,
  };
}
