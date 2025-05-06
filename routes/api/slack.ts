// routes/api/slack.ts
import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { handlePinSubmission } from "../../src/api-tester/core/slack/handlePinSubmission.ts";

export const handler: Handlers = {
  async POST(req, _ctx) {
    const rawBody = await req.text();
    // Slack Signature prüfen
    if (!validateSignature(req, rawBody)) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Slack schickt URL-Verification beim Setup
    const payload = JSON.parse(rawBody);
    if (payload.type === "url_verification") {
      // einfach den challenge zurückgeben
      return new Response(payload.challenge, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Interactions (z.B. Modal-Submit)
    if (
      payload.type === "view_submission" &&
      payload.view.callback_id === "pin_submission"
    ) {
      // handlePinSubmission erwartet parsed JSON mit genau diesem Shape
      await handlePinSubmission(payload);
      // Slack will ein JSON mit null, sonst Timeout
      return new Response(null, { status: 200 });
    }

    // andere Interaction-Arten ignorieren
    return new Response(null, { status: 200 });
  },
};
