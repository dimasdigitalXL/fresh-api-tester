/** @jsxImportSource preact */
import { slackDebugEvents } from "../src/api-tester/core/slack/debugStore.ts";

export default function Home() {
  return (
    <div class="min-h-screen bg-gray-100">
      {/* Kopfbereich */}
      <header class="bg-white shadow">
        <div class="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 class="text-3xl font-bold text-gray-900">
            📬 Letzte Slack-Debug-Events
          </h1>
        </div>
      </header>

      {/* Hauptinhalt */}
      <main class="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {slackDebugEvents.length === 0
          ? (
            <p class="text-gray-600 italic">
              Noch keine Events eingegangen.
            </p>
          )
          : (
            <div class="grid gap-6">
              {slackDebugEvents.map((e) => (
                <article
                  key={e.time}
                  class="bg-white overflow-hidden shadow rounded-lg"
                >
                  <div class="px-4 py-5 sm:p-6">
                    {/* Kopfzeile der Karte */}
                    <header class="flex justify-between items-center mb-4">
                      <time class="text-sm font-medium text-gray-500">
                        {new Date(e.time).toLocaleDateString("de-DE")}{" "}
                        {new Date(e.time).toLocaleTimeString("de-DE")}
                      </time>
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {e.type}
                      </span>
                    </header>

                    {/* Payload als JSON */}
                    <pre class="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded">
{JSON.stringify(e.rawPayload, null, 2)}
                    </pre>
                  </div>
                </article>
              ))}
            </div>
          )}
      </main>
    </div>
  );
}
