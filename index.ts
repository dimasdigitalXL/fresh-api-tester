// index.ts

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { runAllTests } from "./run-tests.ts";
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

// 1) Cron-Job auf Top-Level
Deno.cron(
  "run-tests-every-12h",
  "0 */12 * * *",
  async () => {
    console.log("⏰ [Cron] Starte API-Tests…");
    try {
      await runAllTests();
      console.log("✅ [Cron] API-Tests erfolgreich durchlaufen");
    } catch (err) {
      console.error("❌ [Cron] API-Tests fehlgeschlagen:", err);
    }
  },
);

// 2) Fresh-Server starten
await start(manifest, config);
