/** @jsxImportSource preact */
import { slackDebugEvents } from "../src/api-tester/core/slack/debugStore.ts";

export default function Home() {
  return (
    <div class="p-6 max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-4">📬 Letzte Slack-Events</h1>
      {slackDebugEvents.length === 0
        ? <p class="text-gray-600">Noch keine Events eingegangen.</p>
        : (
          <ul class="space-y-6">
            {slackDebugEvents.map((e) => (
              <li key={e.time} class="border rounded p-4 bg-gray-50">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-semibold">
                    {new Date(e.time).toLocaleDateString("de-DE")}{" "}
                    {new Date(e.time).toLocaleTimeString("de-DE")}
                  </span>
                  <code class="text-sm bg-gray-200 px-2 py-1 rounded">
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
