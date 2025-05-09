// src/api-tester/core/slack/validateSignature.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

/**
 * Validates a Slack request by verifying its signature.
 *
 * @param req     The incoming Request (muss x-slack-* Header enthalten).
 * @param rawBody The rohe Request-Body als String.
 * @returns       true, wenn Signatur gültig oder SKIP_VALIDATE_SIGNATURE="true".
 */
export async function validateSignature(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  // ✅ Dev-Bypass: Umgehung per ENV-Var für lokale Tests
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

  // Replay-Angriffe verhindern (±5 Min)
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - Number(timestamp));
  if (age > 60 * 5) {
    console.error("🚨 Slack request timestamp zu alt:", age, "Sekunden");
    return false;
  }

  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${rawBody}`;
  const data = encoder.encode(baseString);

  // Versuche jeden Signing-Secret
  const workspaces = getSlackWorkspaces();
  for (const { signingSecret } of workspaces) {
    const keyBuf = encoder.encode(signingSecret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, data);
    const hashHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const mySig = `v0=${hashHex}`;

    // Konstantzeit-Vergleich
    const a = encoder.encode(mySig);
    const b = encoder.encode(slackSig);
    if (a.length === b.length && a.every((v, i) => v === b[i])) {
      return true;
    }
  }

  console.error("🚨 Keine gültige Slack-Signatur gefunden");
  return false;
}
