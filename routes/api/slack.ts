// routes/api/slack.ts

import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { openPinModal } from "../../src/api-tester/core/slack/openPinModal.ts";
import {
  handlePinSubmission,
  type SlackSubmissionPayload,
} from "../../src/api-tester/core/slack/handlePinSubmission.ts";
import { slackDebugEvents } from "../../src/api-tester/core/slack/debugStore.ts";

/** Für Button-Klick (block_actions) */
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

    // ─── 1) Signatur prüfen ─────────────────────────────
    if (!(await validateSignature(req, rawBody))) {
      return new Response("Invalid signature", { status: 401 });
    }

    // ─── 2) application/json: URL-Verification & Modal-Submit ─
    if (contentType.includes("application/json")) {
      const parsed = JSON.parse(rawBody) as unknown;

      // URL-Verification
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { type: unknown }).type === "url_verification"
      ) {
        const challenge = (parsed as { challenge: unknown }).challenge;
        if (typeof challenge === "string") {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      // Modal-Submit (PIN-Dialog)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { type: unknown }).type === "view_submission"
      ) {
        // Ack 200
        const resp = new Response("", { status: 200 });
        // Cast unknown → SlackSubmissionPayload (erlaubt)
        void handlePinSubmission(parsed as SlackSubmissionPayload);
        return resp;
      }

      // andere JSON-Events acken
      return new Response("", { status: 200 });
    }

    // ─── 3) application/x-www-form-urlencoded: Block-Actions ────
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payload = JSON.parse(params.get("payload")!) as BlockActionPayload;

      if (payload.type === "block_actions") {
        const resp = new Response("", { status: 200 });
        void openPinModal({
          triggerId: payload.trigger_id,
          endpoint: payload.actions[0].value,
          messageTs: payload.message.ts,
          channelId: payload.channel.id,
        });
        return resp;
      }

      // andere Form-Events acken
      return new Response("", { status: 200 });
    }

    // ─── 4) Fallback ──────────────────────────────────────
    return new Response("", { status: 200 });
  },
};
