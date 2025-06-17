// routes/api/cron-log-stream.ts
import { Handlers } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";

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
        const send = async () => {
          const entry = await kvInstance.get<string>(["lastCronRun"]);
          const lastRun = entry.value ?? null;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ lastRun })}\n\n`),
          );
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
