/** @jsxImportSource preact */
/** islands/RunTestsIsland.tsx */
import { useSignal } from "@preact/signals";

export function RunTestsIsland() {
  const status = useSignal<"idle" | "loading" | "success" | "error">("idle");

  const runTests = async () => {
    status.value = "loading";
    try {
      const res = await fetch("/api/run-tests");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status.value = "success";

      // Cron-Log updaten
      const logRes = await fetch("/api/cron-log");
      if (logRes.ok) {
        const { lastRun } = (await logRes.json()) as { lastRun: string | null };
        globalThis.dispatchEvent(
          new CustomEvent("cron-updated", { detail: lastRun }),
        );
      }
    } catch {
      status.value = "error";
    }
  };

  return (
    <div class="my-4 flex flex-col items-center">
      <button
        type="button"
        class="px-8 py-4 w-64 text-3xl bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 disabled:opacity-50"
        onClick={runTests}
        disabled={status.value === "loading"}
      >
        {status.value === "loading" ? "Starte Tests…" : "Tests starten"}
      </button>

      {status.value === "success" && (
        <div class="mt-2 flex flex-col items-center space-y-1">
          <p class="text-green-600">✅ Alle Tests abgeschlossen.</p>
          <p class="text-green-600">
            📩 Slack-Testbericht versendet und Blöcke gespeichert.
          </p>
        </div>
      )}

      {status.value === "error" && (
        <p class="mt-2 text-red-600">❌ Fehler beim Ausführen der Tests.</p>
      )}
    </div>
  );
}
