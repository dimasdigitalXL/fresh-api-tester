// src/api-tester/core/versionChecker.ts

import type { EndpointConfig } from "./configLoader.ts";

export interface VersionCheckResult extends EndpointConfig {
  versionChanged: boolean;
}

/**
 * Prüft, ob für den übergebenen API-Endpunkt eine neue Version existiert (z.B. /v2/ statt /v1/).
 * @param endpoint      Der API-Endpunkt aus der config.json
 * @param dynamicParams Dynamische Platzhalter wie {id}, etc.
 * @returns             endpoint (ggf. mit aktualisierter URL und versionChanged=true)
 */
export async function checkAndUpdateApiVersion(
  endpoint: EndpointConfig,
  dynamicParams: Record<string, string> = {},
): Promise<VersionCheckResult> {
  // 1) Aktuelle Versionsnummer extrahieren, z.B. "1" aus "/v1/"
  const versionRegex = /\/v(\d+)\//;
  const match = endpoint.url.match(versionRegex);
  const currentVersion = match ? Number(match[1]) : null;

  if (currentVersion === null) {
    // keine Version in der URL → nichts tun
    return { ...endpoint, versionChanged: false };
  }

  // 2) Nächsthöhere Version testen
  const nextVersion = currentVersion + 1;
  const candidateUrlTemplate = endpoint.url.replace(
    `/v${currentVersion}/`,
    `/v${nextVersion}/`,
  );

  // Platzhalter ersetzen: ${XENTRAL_ID} und dynamische Params
  let finalUrl = candidateUrlTemplate.replace(
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
      // prüfen, ob wir wirklich eine valide Antwort erhalten
      if (!data.error || data.error.http_code !== 0) {
        console.log(`✅ Neue API-Version erkannt: /v${nextVersion}/`);
        const updatedUrl = endpoint.url.replace(
          `/v${currentVersion}/`,
          `/v${nextVersion}/`,
        );
        return { ...endpoint, url: updatedUrl, versionChanged: true };
      } else {
        console.warn(
          `⛔️ Version /v${nextVersion}/ liefert Fehlerstruktur – ignoriert.`,
        );
      }
    } else {
      console.warn(
        `⚠️ Fehler beim Prüfen von /v${nextVersion}/: HTTP ${res.status}`,
      );
    }
  } catch (err) {
    console.warn(`⚠️ Fehler beim Prüfen von /v${nextVersion}/: ${err}`);
  }

  // keine neue Version gefunden
  return { ...endpoint, versionChanged: false };
}
