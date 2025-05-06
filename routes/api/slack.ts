// routes/api/slack.ts

import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { openPinModal } from "../../src/api-tester/core/slack/openPinModal.ts";
import { handlePinSubmission } from "../../src/api-tester/core/slack/handlePinSubmission.ts";

export const handler: Handlers = {
  // Optional: Health-Check
  GET() {
    return new Response("Slack-Endpoint OK", { status: 200 });
  },

  async POST(req) {
    // 1️⃣ Raw Body einlesen
    const rawBody = await req.text();

    // 2️⃣ Signatur prüfen (zwei Argumente!)
    if (!(await validateSignature(req, rawBody))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";

    // 3️⃣ URL-Verification (nur beim Setup)
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

    // 4️⃣ Interaktive Payloads (Buttons / Modals)
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payload = JSON.parse(params.get("payload")!);

      // 4a) Button-Klick → Modal öffnen
      if (payload.type === "block_actions") {
        const action = payload.actions[0];
        await openPinModal({
          triggerId: payload.trigger_id,
          endpoint: action.value,
          messageTs: payload.message.ts,
          channelId: payload.channel.id,
        });
      }

      // 4b) Modal-Submit → PIN verarbeiten
      if (
        payload.type === "view_submission" &&
        payload.view.callback_id === "pin_submission"
      ) {
        await handlePinSubmission(payload);
      }

      return new Response("", { status: 200 });
    }

    // 5️⃣ Fallback
    return new Response("", { status: 200 });
  },
};