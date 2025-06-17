/** @jsxImportSource preact */
/** islands/SlackDebugEventsIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function SlackDebugEventsIsland() {
  const events = useSignal<Record<string, unknown>[]>([]);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/slack-stream");

    es.onopen = () => {
      error.value = null;
    };

    es.onmessage = (e) => {
      try {
        events.value = JSON.parse(e.data);
        error.value = null;
      } catch (err) {
        // parse error ignorieren
        console.warn("Slack event parse error:", err);
      }
    };

    es.onerror = () => {
      error.value = "Verbindung zum Stream unterbrochen. Versuche es erneut…";
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  return (
    <div class="mx-auto w-full max-w-screen-md p-4 border rounded-lg shadow-sm mt-8 text-center my-4">
      <h2 class="text-xl mb-2">Slack-Debug-Events (live)</h2>
      {error.value && <p class="text-red-600 mb-2">{error.value}</p>}
      {events.value.length === 0
        ? <p>Noch keine Slack-Events eingegangen.</p>
        : (
          <ul class="list-disc pl-5 space-y-2 inline-block text-left">
            {events.value.map((evt, i) => (
              <li key={i}>
                <pre class="whitespace-pre-wrap">
                {JSON.stringify(evt, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
