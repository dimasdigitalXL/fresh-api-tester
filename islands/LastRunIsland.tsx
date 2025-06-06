/** @jsxImportSource preact */
/** islands/LastRunIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export function LastRunIsland() {
  const lastRun = useSignal<string>("Lade…");

  useEffect(() => {
    fetch("/api/cron-log")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Fehler beim Laden der Cron-Log-Daten");
        }
        return res.json();
      })
      .then((data) => {
        lastRun.value = data.lastRun || "Kein Datum verfügbar"; // Standardwert für leere Daten
      })
      .catch((error) => {
        console.error("Fehler beim Abrufen der Cron-Daten:", error);
        lastRun.value = "Fehler beim Laden"; // Fehlerwert für den Fall eines Problems
      });
  }, []); // Diese Wirkung wird nur einmal beim Laden der Komponente ausgeführt

  return <span>{lastRun.value}</span>;
}
