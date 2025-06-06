// routes/api/cron-log.ts

import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET() {
    try {
      // Versuche, die letzte Cron-Run-Zeit aus der Umgebungsvariable zu lesen
      const lastRun = Deno.env.get("LAST_CRON_RUN") ??
        new Date().toLocaleString("de-DE"); // Wenn keine Umgebungsvariable gesetzt ist, aktuelles Datum verwenden

      // Antwort mit dem Zeitstempel des letzten Cron-Jobs
      return new Response(JSON.stringify({ lastRun }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Fehlerbehandlung, falls das Abrufen der Umgebungsvariable oder das Setzen des Werts fehlschlägt
      console.error(
        "Fehler beim Abrufen der LAST_CRON_RUN-Umgebungsvariable:",
        err,
      );
      return new Response(
        "Fehler beim Abrufen des letzten Cron-Job-Zeitstempels.",
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
