// main.ts

// ─── 1) Alle Environment-Variablen laden (u. a. SLACK_PIN, GITHUB_OWNER, …) ──────────
import "https://deno.land/std@0.216.0/dotenv/load.ts";

// ─── 2) Cron-Job auf Top-Level (muss VOR allen anderen Imports stehen!) ────────────
import { runAllTests } from "./run-tests.ts";

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

// ─── 3) Fresh-App (HTTP-Server) starten → in app.ts definiert ───────────────────────
import "./app.ts";
