/** @jsxImportSource preact */
/** components/islands/LastRunIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export function LastRunIsland() {
  const lastRun = useSignal<string>("Lade…");

  useEffect(() => {
    const es = new EventSource("/api/cron-log-stream");

    es.onopen = () => {
      lastRun.value = "Lade…";
    };

    es.onmessage = (e) => {
      try {
        const { lastRun: lr } = JSON.parse(e.data) as {
          lastRun: string | null;
        };
        if (lr) {
          const date = new Date(lr);
          // Immer in Europe/Berlin anzeigen, unabhängig von Server-Zeitzone
          lastRun.value = date.toLocaleString("de-DE", {
            timeZone: "Europe/Berlin",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } else {
          lastRun.value = "unbekannt";
        }
      } catch {
        // Parse-Fehler ignorieren
      }
    };

    es.onerror = () => {
      lastRun.value = "Fehler beim Stream. Reconnect…";
    };

    return () => {
      es.close();
    };
  }, []);

  return <span>{lastRun.value}</span>;
}
