// src/api-tester/core/versionChecker.ts

import type { Endpoint } from "./apiCaller.ts";

export interface VersionCheckResult extends Endpoint {
  versionChanged: boolean;
}

/**
 * Prüft, ob für den übergebenen API-Endpunkt eine neue Version existiert (z.B. /v2/ statt /v1/).
 * Führt dazu einen echten HTTP-Request mit fetch durch.
 *
 * @param endpoint        Der API-Endpunkt aus der config.json
 * @param dynamicParams   Dynamische Platzhalter wie {id}, falls erforderlich
 * @returns               endpoint (ggf. mit aktualisierter URL und versionChanged=true)
 */
export async function checkAndUpdateApiVersion(
  endpoint: Endpoint,
  dynamicParams: Record<string, string> = {},
): Promise<VersionCheckResult> {
  // Regex extrahiert aktuelle Versionsnummer, z.B. "1" aus "/v1/"
  const versionRegex = /\/v(\d+)\//;
  const match = endpoint.url.match(versionRegex);
  const currentVersion = match ? Number(match[1]) : null;

  // Keine Version in der URL → überspringen
  if (currentVersion === null) {
    return { ...endpoint, versionChanged: false };
  }

  const testedVersion = currentVersion + 1;
  // URL-Vorlage mit potenziell neuer Version
  const newUrlTemplate = endpoint.url.replace(
    `/v${currentVersion}/`,
    `/v${testedVersion}/`,
  );

  // Platzhalter ersetzen: ${XENTRAL_ID} und dynamische Parameter {id}, etc.
  let finalUrl = newUrlTemplate.replace(
    "${XENTRAL_ID}",
    Deno.env.get("XENTRAL_ID") ?? "",
  );
  for (const [key, val] of Object.entries(dynamicParams)) {
    finalUrl = finalUrl.replace(`{${key}}`, val);
  }

  try {
    const res = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${Deno.env.get("BEARER_TOKEN") ?? ""}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "XentralAPITester",
      },
    });

    if (res.ok) {
      const data = await res.json();
      // Prüfen, ob keine Fehlerstruktur zurückkommt
      if (!data.error || data.error.http_code !== 0) {
        console.log(`✅ Neue API-Version erkannt: /v${testedVersion}/`);
        const updatedUrl = endpoint.url.replace(
          `/v${currentVersion}/`,
          `/v${testedVersion}/`,
        );
        return { ...endpoint, url: updatedUrl, versionChanged: true };
      } else {
        console.warn(
          `⛔️ Version /v${testedVersion}/ liefert Fehlerstruktur – keine gültige API-Version.`,
        );
      }
    } else {
      console.warn(
        `⚠️ Fehler beim Prüfen von /v${testedVersion}/: HTTP ${res.status}`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Fehler beim Prüfen von /v${testedVersion}/: ${msg}`);
  }

  // Keine neue Version gefunden
  return { ...endpoint, versionChanged: false };
}
