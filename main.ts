/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { runAllTests } from "./run-tests.ts";
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

/**
 * Cron-Job auf Top-Level: alle 12 Stunden
 */
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

/**
 * Fresh-Server starten (HTTP-Endpunkte)
 */
await start(manifest, config);
