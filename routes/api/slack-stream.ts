// routes/api/slack-stream.ts
import { Handlers } from "$fresh/server.ts";
import { slackDebugEvents } from "../../src/api-tester/core/slack/debugStore.ts";

const encoder = new TextEncoder();

export const handler: Handlers = {
  GET(_req, _ctx) {
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    let timerId: number;
    const body = new ReadableStream({
      start(controller) {
        const send = () => {
          const payload = JSON.stringify(slackDebugEvents);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        };
        // sofort senden und dann alle 2 Sekunden
        send();
        timerId = setInterval(send, 2000);
      },
      cancel() {
        clearInterval(timerId);
      },
    });

    return new Response(body, { status: 200, headers });
  },
};
