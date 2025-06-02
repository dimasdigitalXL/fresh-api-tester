// routes/api/slack.ts

import "https://deno.land/std@0.216.0/dotenv/load.ts"; // lädt .env in Deno.env
import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { openPinModal } from "../../src/api-tester/core/slack/openPinModal.ts";
import {
  handlePinSubmission,
  type SlackSubmissionPayload,
} from "../../src/api-tester/core/slack/handlePinSubmission.ts";
import { slackDebugEvents } from "../../src/api-tester/core/slack/debugStore.ts";

const SKIP_VERIFY = Deno.env.get("SKIP_VALIDATE_SIGNATURE") === "true";

interface BlockActionPayload {
  type: string;
  trigger_id: string;
  actions: Array<{ value: string }>;
  message: { ts: string };
  channel: { id: string };
}

export const handler: Handlers = {
  GET() {
    return new Response("Slack-Endpoint OK", { status: 200 });
  },

  async POST(req) {
    const rawBody = await req.text();
    const contentType = req.headers.get("content-type") ?? "";

    // ─── Debug: rohes Event speichern ───────────────────
    try {
      let parsed: unknown = rawBody;
      if (contentType.includes("application/json")) {
        parsed = JSON.parse(rawBody);
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(rawBody);
        parsed = JSON.parse(params.get("payload")!);
      }
      let evtType = "unknown";
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        typeof (parsed as { type: unknown }).type === "string"
      ) {
        evtType = (parsed as { type: string }).type;
      }
      slackDebugEvents.unshift({
        time: Date.now(),
        type: evtType,
        rawPayload: parsed,
      });
      if (slackDebugEvents.length > 20) slackDebugEvents.pop();
    } catch {
      // parse errors ignorieren
    }

    // ─── 1) Signatur prüfen (überspringen, wenn SKIP_VERIFY) ────
    if (!SKIP_VERIFY) {
      const sig = req.headers.get("x-slack-signature");
      const ts = req.headers.get("x-slack-request-timestamp");
      if (!sig || !ts || !(await validateSignature(req, rawBody))) {
        console.warn("🚨 Slack-Signatur fehlt oder ungültig");
        return new Response("Invalid signature", { status: 401 });
      }
    }

    // ─── 2) application/json: URL-Verification & Modal-Submit ───
    if (contentType.includes("application/json")) {
      const parsedUnknown = JSON.parse(rawBody) as unknown;
      if (typeof parsedUnknown === "object" && parsedUnknown !== null) {
        const parsedObj = parsedUnknown as {
          type?: unknown;
          challenge?: unknown;
          view?: unknown;
        };
        // URL-Verification
        if (
          parsedObj.type === "url_verification" &&
          typeof parsedObj.challenge === "string"
        ) {
          return new Response(parsedObj.challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        // Modal-Submit (PIN-Dialog)
        if (
          parsedObj.type === "view_submission" &&
          typeof parsedObj.view === "object"
        ) {
          const resp = new Response("", { status: 200 });
          void handlePinSubmission(parsedUnknown as SlackSubmissionPayload);
          return resp;
        }
      }
      return new Response("", { status: 200 });
    }

    // ─── 3) application/x-www-form-urlencoded: Block-Actions ──────
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payloadUnknown = JSON.parse(params.get("payload")!);
      if (
        typeof payloadUnknown === "object" &&
        payloadUnknown !== null &&
        (payloadUnknown as { type?: unknown }).type === "block_actions"
      ) {
        const payload = payloadUnknown as BlockActionPayload;
        const resp = new Response("", { status: 200 });
        void openPinModal({
          triggerId: payload.trigger_id,
          endpointJson: payload.actions[0].value, // enthält { endpointName, method, missing[], extra[], typeMismatches[], original_ts, channel }
        });
        return resp;
      }
      return new Response("", { status: 200 });
    }

    // ─── 4) Fallback ────────────────────────────────────────────
    return new Response("", { status: 200 });
  },
};
