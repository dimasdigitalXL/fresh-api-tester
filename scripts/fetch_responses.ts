// scripts/fetch_responses.ts

import {
  type EndpointConfig as _EndpointConfig,
  loadConfig,
} from "../src/api-tester/core/configLoader.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import defaultIdsRaw from "../src/api-tester/default-ids.json" with {
  type: "json",
};

/**
 * Baut URL, indem Platzhalter {key} ersetzt werden.
 * Hier muss id-Werte aus defaultIds genutzt werden.
 */
function buildUrl(template: string, params: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const val = params[key];
    if (val === undefined) {
      throw new Error(`Kein Wert für URL-Parameter "${key}"`);
    }
    return encodeURIComponent(val);
  });
}

async function main() {
  // 1) Config laden
  const cfg = await loadConfig();
  console.log(
    "🔧 Lade Endpunkte aus config.json:",
    cfg.endpoints.map((e) => e.name),
  );

  // 2) Output-Verzeichnis erstellen
  const outDir = join(Deno.cwd(), "src", "api-tester", "responses");
  await Deno.mkdir(outDir, { recursive: true });

  // 3) defaultIds aus JSON
  const defaultIds = defaultIdsRaw as Record<
    string,
    string | Record<string, string>
  >;

  // 4) Jeden Endpoint durchgehen
  for (const ep of cfg.endpoints) {
    const endpointName = ep.name; // Originalname mit Leerzeichen

    // 5) Default-ID(s) für Endpoint ermitteln
    const idEntry = defaultIds[endpointName];
    if (ep.requiresId && !idEntry) {
      console.warn(
        `⚠️ Überspringe "${endpointName}": Kein passenden Default-ID-Eintrag gefunden für "${endpointName}".`,
      );
      continue;
    }

    // 6) Parameter für URL zusammenstellen
    let params: Record<string, string> = {};

    if (typeof idEntry === "string") {
      // Einfacher Fall: nur 'id'
      params = { id: idEntry };
    } else if (typeof idEntry === "object" && idEntry !== null) {
      // Objekt mit mehreren IDs, z.B. { customerId: "...", id: "..." }
      params = idEntry;
    }

    // Ersetze evtl. Umgebungsvariablen in Headern (z.B. Bearer Token)
    if (ep.headers) {
      for (const [key, val] of Object.entries(ep.headers)) {
        if (
          typeof val === "string" && val.includes("${") && val.includes("}")
        ) {
          const envVar = val.match(/\${([^}]+)}/)?.[1];
          if (envVar) {
            const envVal = Deno.env.get(envVar);
            if (envVal) {
              ep.headers[key] = val.replace(`\${${envVar}}`, envVal);
            }
          }
        }
      }
    }

    // 7) URL bauen
    let url: string;
    try {
      // Ersetze ${XENTRAL_ID} aus ENV
      if (!ep.url.includes("${XENTRAL_ID}")) {
        throw new Error("URL erwartet Variable ${XENTRAL_ID} nicht");
      }
      const xentralId = Deno.env.get("XENTRAL_ID");
      if (!xentralId) {
        console.warn(
          `⚠️ Überspringe "${endpointName}": Umgebungsvariable XENTRAL_ID nicht gesetzt.`,
        );
        continue;
      }
      const urlTemplate = ep.url.replace("${XENTRAL_ID}", xentralId);

      url = buildUrl(urlTemplate, params);
    } catch (err) {
      console.warn(
        `⚠️ Überspringe "${endpointName}": ${(err as Error).message}`,
      );
      continue;
    }

    // 8) Query-Parameter anhängen (optional)
    if (ep.query && Object.keys(ep.query).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(ep.query)) {
        qs.append(k, String(v));
      }
      url += url.includes("?") ? `&${qs}` : `?${qs}`;
    }

    // 9) API-Request senden
    try {
      // Debug-Ausgabe vor fetch
      console.log(`\n🔍 Endpoint: ${ep.name}`);
      console.log(`URL: ${url}`);
      console.log("Headers:");
      for (const [key, val] of Object.entries(ep.headers ?? {})) {
        console.log(`  ${key}: ${val}`);
      }

      const resp = await fetch(url, {
        method: ep.method,
        headers: ep.headers,
      });

      if (!resp.ok) {
        console.warn(
          `⚠️ ${ep.name}: HTTP-Status ${resp.status} ${resp.statusText}`,
        );
        continue;
      }

      const data = await resp.json();

      // 10) Antwort in Datei speichern
      const fileName = endpointName.replace(/\s+/g, "_") + ".json";
      const filePath = join(outDir, fileName);

      await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
      console.log(
        `✅ Antwort für "${endpointName}" gespeichert als ${fileName}`,
      );
    } catch (err) {
      console.warn(
        `⚠️ Fehler bei "${endpointName}": ${(err as Error).message}`,
      );
    }
  }

  console.log("✅ Alle Endpunkte abgearbeitet.");
}

if (import.meta.main) {
  main();
}
