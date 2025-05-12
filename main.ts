/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import "$std/dotenv/load.ts";

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

// --- Neu: importiere deine Test-Runner Funktion ---
import { runAllTests } from "./run-tests.ts";

// Cron-Job: führe alle 10 Minuten deine Tests aus.
// Name = "run-tests-every-10", Schedule = "*/10 * * * *"

Deno.cron(
  "run-tests-every-hour",
  "*/10 * * * *",
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

await start(manifest, config);
