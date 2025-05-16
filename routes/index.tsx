/** @jsxImportSource preact */
/** routes/index.tsx */
import type { PageProps } from "$fresh/server.ts";
import LastRunIsland from "../islands/LastRunIsland.tsx";
import { slackDebugEvents } from "../src/api-tester/core/slack/debugStore.ts";

export default function Home(_props: PageProps) {
  return (
    <div class="flex flex-col items-center justify-center min-h-screen bg-white text-green-700 p-6">
      {/* DigitalXL-Logo (in /static/digitalxl-logo.svg ablegen) */}
      <img
        src="/digitalxl-logo.svg"
        alt="digitalXL Logo"
        class="w-32 h-auto mb-6"
      />

      {/* Titel */}
      <h1 class="text-4xl font-bold mb-2">digitalXL API-Tester</h1>

      {/* Letzter Cron-Job (Island) */}
      <p class="mb-6 text-green-600">
        Letzter Cron-Job-Lauf: <LastRunIsland />
      </p>

      {/* Slack-Debug-Events */}
      {slackDebugEvents.length === 0
        ? <p class="text-green-500">Noch keine Slack-Events eingegangen.</p>
        : (
          <ul class="space-y-4 w-full max-w-xl">
            {slackDebugEvents.map((e) => (
              <li
                key={e.time}
                class="border border-green-300 rounded p-4 bg-green-50 text-green-700"
              >
                <div class="flex justify-between items-center mb-2">
                  <span class="font-semibold">
                    {new Date(e.time).toLocaleDateString("de-DE")}{" "}
                    {new Date(e.time).toLocaleTimeString("de-DE")}
                  </span>
                  <code class="text-sm bg-green-100 px-2 py-1 rounded">
                    {e.type}
                  </code>
                </div>
                <pre class="whitespace-pre-wrap text-sm">
                {JSON.stringify(e.rawPayload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
