/** @jsxImportSource preact */
/** routes/index.tsx */
import { useEffect, useState } from "preact/hooks";
import { slackDebugEvents } from "../src/api-tester/core/slack/debugStore.ts";

export default function Home() {
  // Für Demo: Zeitpunkt, zu dem die Seite gerendert wurde
  const [lastRun, setLastRun] = useState<string>("—");
  useEffect(() => {
    const now = new Date();
    setLastRun(
      `${now.toLocaleDateString("de-DE")} ${now.toLocaleTimeString("de-DE")}`,
    );
  }, []);

  return (
    <div class="flex flex-col items-center justify-center min-h-screen bg-white p-6">
      {/* Logo */}
      <img
        src="/digitalxl-logo.svg"
        alt="digitalXL Logo"
        class="w-32 h-auto mb-6"
      />

      {/* Überschrift */}
      <h1 class="text-4xl font-bold mb-2 text-green-600">
        digitalXL API-Tester
      </h1>

      {/* Letzter Cron-Lauf (hier Platzhalter: Seiten-Render) */}
      <p class="mb-6 text-green-500">
        Letzter Cronjob-Lauf: {lastRun}
      </p>

      {/* Slack-Events (falls gewünscht) */}
      {slackDebugEvents.length === 0
        ? (
          <p class="text-green-400">
            Noch keine Slack-Events eingegangen.
          </p>
        )
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
