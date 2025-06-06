/** @jsxImportSource preact */
/** islands/SlackDebugEventsIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Definiere den Typ für jedes SlackDebugEvent
interface SlackDebugEvent {
  time: string;
  type: string;
  rawPayload: Record<string, unknown>;
}

export default function SlackDebugEventsIsland() {
  const slackDebugEvents = useSignal<SlackDebugEvent[]>([]);

  useEffect(() => {
    // API-Aufruf, um die Slack Debug Events zu holen
    fetch("/api/slack-debug-events")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Fehler: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        slackDebugEvents.value = data.events; // Setzen der empfangenen Slack-Events
      })
      .catch((err) => {
        console.error("Fehler beim Laden der Slack-Events:", err);
        slackDebugEvents.value = []; // Im Fehlerfall leere Liste anzeigen
      });
  }, []); // Diese Funktion wird nur beim ersten Rendern ausgeführt

  return (
    <div>
      {slackDebugEvents.value.length === 0
        ? <p class="text-green-500">Noch keine Slack-Events eingegangen.</p>
        : (
          <ul class="space-y-4 w-full max-w-xl">
            {slackDebugEvents.value.map((e) => (
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
