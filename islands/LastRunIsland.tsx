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
        lastRun.value = lr ?? "unbekannt";
      } catch {
        // parse error — nichts tun
      }
    };

    es.onerror = () => {
      lastRun.value = "Fehler beim Stream. Reconnect…";
      // SSE reconnectet automatisch
    };

    return () => {
      es.close();
    };
  }, []);

  return <span>{lastRun.value}</span>;
}
