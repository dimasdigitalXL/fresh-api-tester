/** @jsxImportSource preact */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function LogIsland() {
  // Signal statt useState
  const lastRun = useSignal<string>("Lade…");

  useEffect(() => {
    // Hier holst du dir deine echte Cron-Zeit von deinem API-Endpoint
    fetch("/api/cron-log")
      .then((res) => res.json())
      .then((data) => {
        lastRun.value = data.lastRun;
      })
      .catch(() => {
        lastRun.value = "Fehler beim Laden";
      });
  }, []);

  return (
    <p class="text-2xl">
      {lastRun.value}
    </p>
  );
}
