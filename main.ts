// main.ts

// ─── 1) Alle Environment-Variablen laden (u. a. SLACK_PIN, GITHUB_OWNER, …) ──────────
import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { runAllTests } from "./run-tests.ts";

// ─── 2) Cron-Job auf Top-Level (muss VOR allen anderen Imports stehen!) ────────────
Deno.cron(
  "run-tests-every-24hours",
  "0 12 * * *",
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

// ─── 3) Fresh-App (HTTP-Server) starten → mit start(manifest, config) ─────────────
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

await start(manifest, config);
