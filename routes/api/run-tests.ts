// routes/api/run-tests.ts

import type { Handlers } from "$fresh/server.ts";
import { runAllTests } from "../../run-tests.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts"; // Importiere kvInstance, um auf KV zuzugreifen

export const handler: Handlers = {
  async GET() {
    try {
      // 1) API-Tests ausführen
      await runAllTests();

      // 2) Den aktuellen Zeitstempel des Cron-Job-Laufs erstellen
      const timestamp = new Date().toLocaleString("de-DE");

      // 3) Den Zeitstempel des letzten Cron-Job-Laufs in KV speichern
      await kvInstance.set(["lastCronRun"], timestamp);

      // 4) Erfolgsantwort zurückgeben
      return new Response("OK: Tests ausgelöst", { status: 200 });
    } catch (err: unknown) {
      console.error("❌ Fehler in runAllTests:", err);
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Error: ${msg}`, { status: 500 });
    }
  },
};
