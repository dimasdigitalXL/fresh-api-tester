// src/api-tester/core/slack/validateSignature.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

/**
 * Validiert die Slack-Signatur eines eingehenden Requests.
 * - Überspringt die Validierung, wenn SKIP_VALIDATE_SIGNATURE=true.
 * - Prüft, ob Timestamp < 5 Minuten alt ist.
 * - Vergleicht HMAC-SHA256 über "v0:{timestamp}:{rawBody}" mit X-Slack-Signature.
 *
 * @param req     Der eingehende Request
 * @param rawBody Der unparsed Body als String
 * @returns       true, wenn die Signatur gültig ist, sonst false
 */
export async function validateSignature(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  // 0) Bypass im DEV
  if (Deno.env.get("SKIP_VALIDATE_SIGNATURE") === "true") {
    console.warn(
      "⚠️ SKIP_VALIDATE_SIGNATURE=true → Signature-Validation übersprungen",
    );
    return true;
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const slackSig = req.headers.get("x-slack-signature");
  if (!timestamp || !slackSig) {
    console.error("🚨 Missing Slack signature headers");
    return false;
  }

  // 1) Timestamp-Check (max. 5 Minuten Differenz)
  const fiveMin = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > fiveMin) {
    console.error("🚨 Slack request timestamp too old");
    return false;
  }

  // 2) Grundstring für HMAC: "v0:{timestamp}:{rawBody}"
  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${rawBody}`;
  const data = encoder.encode(baseString);

  // 3) Alle konfigurierten Workspaces durchlaufen und HMAC prüfen
  const workspaces = getSlackWorkspaces();
  if (workspaces.length === 0) {
    console.error(
      "🚨 Kein Slack-Workspace konfiguriert – Signature-Validation nicht möglich",
    );
    return false;
  }

  for (const { signingSecret } of workspaces) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(signingSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
      const hashHex = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const mySig = `v0=${hashHex}`;

      // 4) Konstante Zeit-Vergleich (constant-time compare)
      const myBuf = encoder.encode(mySig);
      const slackBuf = encoder.encode(slackSig);

      if (myBuf.length !== slackBuf.length) {
        // Unterschiedliche Länge → sofort weitermachen
        continue;
      }

      let diff = 0;
      for (let i = 0; i < myBuf.length; i++) {
        diff |= myBuf[i] ^ slackBuf[i];
      }
      if (diff === 0) {
        // exakte Übereinstimmung
        return true;
      }
    } catch (err) {
      console.error("⚠️ Fehler bei Signature-Validierung:", err);
      continue;
    }
  }

  console.error("🚨 No valid Slack signature found");
  return false;
}
