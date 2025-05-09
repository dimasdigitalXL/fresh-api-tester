// routes/api/slack.ts

import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { openPinModal } from "../../src/api-tester/core/slack/openPinModal.ts";
import { handlePinSubmission } from "../../src/api-tester/core/slack/handlePinSubmission.ts";

// NEU:
import { slackDebugEvents } from "../../src/api-tester/core/slack/debugStore.ts";

export const handler: Handlers = {
  GET() {
    return new Response("Slack-Endpoint OK", { status: 200 });
  },

  async POST(req) {
    const rawBody = await req.text();

    // Debug: rohes Event festhalten
    try {
      const contentType = req.headers.get("content-type") ?? "";
      let parsed: unknown = rawBody;
      if (contentType.includes("application/json")) {
        parsed = JSON.parse(rawBody);
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(rawBody);
        parsed = JSON.parse(params.get("payload")!);
      }
      slackDebugEvents.unshift({
        time: Date.now(),
        type: req.headers.get("x-slack-event-type") ?? "block_actions",
        rawPayload: parsed,
      });
      // Begrenze auf die letzten 20 Einträge
      if (slackDebugEvents.length > 20) slackDebugEvents.pop();
    } catch (_) {
      // swallow
    }

    // Signatur-Check / URL-Verification / Interactivity-Flow …
    if (!(await validateSignature(req, rawBody))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";

    // URL-Verification
    if (contentType.includes("application/json")) {
      const body = JSON.parse(rawBody);
      if (body.type === "url_verification") {
        return new Response(body.challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("", { status: 200 });
    }

    // Interaktive Payloads
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payload = JSON.parse(params.get("payload")!);

      if (payload.type === "block_actions") {
        const ack = new Response("", { status: 200 });
        void openPinModal({
          triggerId: payload.trigger_id,
          endpoint: payload.actions[0].value,
          messageTs: payload.message.ts,
          channelId: payload.channel.id,
        });
        return ack;
      }

      if (
        payload.type === "view_submission" &&
        payload.view.callback_id === "pin_submission"
      ) {
        const ack = new Response("", { status: 200 });
        void handlePinSubmission(payload);
        return ack;
      }

      return new Response("", { status: 200 });
    }

    return new Response("", { status: 200 });
  },
};
