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
    // Keine Versionsangabe in der URL → nichts tun
    return { ...endpoint, versionChanged: false };
  }

  // 2) Nächsthöhere Version konstruieren
  const nextVersion = currentVersion + 1;
  const candidateTemplate = endpoint.url.replace(
    `/v${currentVersion}/`,
    `/v${nextVersion}/`,
  );

  // 3) Platzhalter ersetzen: `${XENTRAL_ID}` und dynamische Params `{key}`
  let finalUrl = candidateTemplate;

  // a) Für `${XENTRAL_ID}` aus ENV lesen (falls der Platzhalter vorhanden ist)
  if (finalUrl.includes("${XENTRAL_ID}")) {
    const xentralId = Deno.env.get("XENTRAL_ID") ?? "";
    finalUrl = finalUrl.split("${XENTRAL_ID}").join(
      encodeURIComponent(xentralId),
    );
  }

  // b) Für dynamische Params in der Form `{key}`
  for (const [key, val] of Object.entries(dynamicParams)) {
    const placeholder = `{${key}}`;
    if (finalUrl.includes(placeholder)) {
      finalUrl = finalUrl.split(placeholder).join(encodeURIComponent(val));
    }
  }

  // 4) Wenn wir keinen Bearer-Token haben, überspringen wir die Versionsprüfung
  const bearerToken = Deno.env.get("BEARER_TOKEN") ?? "";
  if (!bearerToken) {
    console.warn(
      `🔒 BEARER_TOKEN fehlt – überspringe API-Version-Check für "${endpoint.name}".`,
    );
    return { ...endpoint, versionChanged: false };
  }

  // 5) HTTP-Request an die potenzielle neue Version senden
  try {
    const res = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "XentralAPITester",
      },
    });

    if (!res.ok) {
      console.warn(
        `⚠️ Version /v${nextVersion}/ für "${endpoint.name}" liefert HTTP ${res.status} – ignoriere.`,
      );
      return { ...endpoint, versionChanged: false };
    }

    // 6) Nur als JSON auswerten, wenn der Content-Type passt
    const contentType = res.headers.get("content-type") ?? "";
    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      console.warn(
        `⚠️ Version /v${nextVersion}/ für "${endpoint.name}" liefert keinen JSON-Body (content-type=${contentType}) – ignoriere.`,
      );
      return { ...endpoint, versionChanged: false };
    }

    // 7) Prüfen, ob das zurückgegebene Objekt ein Fehler-Objekt enthält
    //    (je nach API-Spezifikation: hier gehen wir davon aus, dass "error" ein Objekt
    //     mit property "http_code" ist und http_code===0 → OK)
    const asObj = data as Record<string, unknown>;
    const errObj = (asObj.error as { http_code?: number } | undefined) ??
      undefined;

    if (errObj && errObj.http_code === 0) {
      // Wenn error.http_code===0, dann ist es formal ein Fehler-Wrapper → keine neue Version
      console.warn(
        `⛔️ Version /v${nextVersion}/ für "${endpoint.name}" liefert error.http_code=0 – ignoriere.`,
      );
      return { ...endpoint, versionChanged: false };
    }

    // 8) Neue Version gefunden
    console.log(
      `✅ Neue API-Version erkannt für "${endpoint.name}": /v${nextVersion}/`,
    );
    const updatedUrl = endpoint.url.replace(
      `/v${currentVersion}/`,
      `/v${nextVersion}/`,
    );

    return { ...endpoint, url: updatedUrl, versionChanged: true };
  } catch (err) {
    console.warn(
      `⚠️ Fehler beim Prüfen von /v${nextVersion}/ für "${endpoint.name}": ${err}`,
    );
    return { ...endpoint, versionChanged: false };
  }
}
