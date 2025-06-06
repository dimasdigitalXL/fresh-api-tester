/** @jsxImportSource preact */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function LogIsland() {
  // Signal statt useState
  const lastRun = useSignal<string>("Lade…");

  useEffect(() => {
    // Abruf der Cron-Log-Zeit von der API
    fetch("/api/cron-log")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Fehler beim Laden der Cron-Log-Daten");
        }
        return res.json();
      })
      .then((data) => {
        lastRun.value = data.lastRun || "Kein Datum verfügbar";
      })
      .catch((error) => {
        console.error(error);
        lastRun.value = "Fehler beim Laden"; // Setzt einen Fehlerwert
      });
  }, []); // Diese Wirkung wird nur einmal ausgeführt

  return (
    <p class="text-2xl">
      {lastRun.value}
    </p>
  );
}
