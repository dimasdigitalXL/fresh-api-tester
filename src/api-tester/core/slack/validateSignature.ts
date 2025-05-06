// src/api-tester/core/slack/validateSignature.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

/**
 * Validates a Slack request by verifying its signature.
 *
 * @param req     The incoming request (headers must include Slack’s timestamp & signature).
 * @param rawBody The raw request body as a string.
 * @returns       True if one of your signing secrets produces a matching signature.
 */
export async function validateSignature(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const slackSig = req.headers.get("x-slack-signature");
  if (!timestamp || !slackSig) {
    console.error("🚨 Missing Slack signature headers");
    return false;
  }

  // Prevent replay attacks (±5 minutes)
  const fiveMin = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > fiveMin) {
    console.error("🚨 Slack request timestamp too old");
    return false;
  }

  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${rawBody}`;
  const data = encoder.encode(baseString);

  // Try each signing secret
  const workspaces = getSlackWorkspaces();
  for (const { signingSecret } of workspaces) {
    // Import the HMAC key
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    // Compute the HMAC
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
    const hashHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const mySig = `v0=${hashHex}`;

    // Constant-time compare
    const myBuf = encoder.encode(mySig);
    const slackBuf = encoder.encode(slackSig);
    if (myBuf.length === slackBuf.length) {
      let equal = true;
      for (let i = 0; i < myBuf.length; i++) {
        if (myBuf[i] !== slackBuf[i]) {
          equal = false;
        }
      }
      if (equal) return true;
    }
  }

  console.error("🚨 No valid Slack signature found");
  return false;
}
