/** @jsxImportSource preact */
/** islands/LastRunIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function LastRunIsland() {
  const lastRun = useSignal("Lade…");

  useEffect(() => {
    fetch("/api/cron-log")
      .then((res) => res.json())
      .then((data) => {
        lastRun.value = data.lastRun;
      })
      .catch(() => {
        lastRun.value = "Fehler beim Laden";
      });
  }, []);

  return <span>{lastRun.value}</span>;
}
