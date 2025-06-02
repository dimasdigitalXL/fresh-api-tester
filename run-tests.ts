/**
 * Orchestriert alle API-Tests, sendet den Ergebnisbericht nach Slack
 * und legt „Pending“-Schema-Updates in KV ab. Das *Committen* in Git
 * geschieht erst, wenn ein User in Slack auf „Einverstanden“ geklickt hat.
 *
 * Usage:
 *   deno run --unstable --unstable-kv -A run-tests.ts
 *   deno run --unstable --unstable-kv -A run-tests.ts --dry-run
 *
 * ENV:
 *   DRY_RUN=true        # aktiviert Dry-Run (Slack-Payload in Konsole)
 *   DISABLE_SLACK=true  # überspringt komplettes Slack-Reporting
 */
import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { loadConfig } from "./src/api-tester/core/configLoader.ts";
import {
  runSingleEndpoint,
  VersionUpdate,
} from "./src/api-tester/core/endpointRunner.ts";
import type { SchemaUpdate } from "./src/api-tester/core/gitPush.ts";
import type { TestResult } from "./src/api-tester/core/apiCaller.ts";
import { sendSlackReport } from "./src/api-tester/core/slack/slackReporter/sendSlackReport.ts";
import { kvInstance } from "./src/api-tester/core/kv.ts";

interface RunOptions {
  dryRun?: boolean;
}

export async function runAllTests({ dryRun = false }: RunOptions = {}) {
  console.log("▶️ run-tests.ts: starte Batch-Durchlauf (dryRun=", dryRun, ")");

  // 1) Config + GitRepo laden
  const cfg = await loadConfig();
  console.log(
    "🔧 Geladene Endpoints:",
    cfg.endpoints.map((e) => e.name),
  );

  // 2) Arrays für Version- und Schema-Updates
  const versionUpdates: VersionUpdate[] = [];
  const schemaUpdates: SchemaUpdate[] = [];
  const results: TestResult[] = [];

  // 3) Jeden Endpoint testen
  for (const ep of cfg.endpoints) {
    const res = await runSingleEndpoint(
      ep,
      cfg,
      versionUpdates,
      schemaUpdates,
    );
    if (res) {
      results.push(res);
    }
  }

  console.log(
    `▶️ Tests abgeschlossen. Gefundene Drifts: ${schemaUpdates.length}. Dry-Run=${dryRun}`,
  );

  // 4) Slack-Reporting (nur bei echten Runs)
  const disableSlack = Deno.env.get("DISABLE_SLACK") === "true";
  if (!dryRun && !disableSlack) {
    console.log("📨 sende Slack-Report …");
    // VersionUpdates werden derzeit nur im Header angezeigt (z.B. neue API-Versionen).
    await sendSlackReport(results, versionUpdates);
  } else if (dryRun) {
    console.log("📣 --- Slack-Payload (Dry-Run) ---");
    console.log(
      JSON.stringify({ results, versionUpdates, schemaUpdates }, null, 2),
    );
  } else {
    console.log("⚠️ Slack-Reporting deaktiviert (DISABLE_SLACK=true)");
  }

  // 5) Alle gefundenen Schema-Drifts NICHT sofort in Git pushen,
  //    sondern in KV als „Pending Updates“ speichern.
  //    Später holt sich der Approval-Handler diese und pusht einzeln.

  if (schemaUpdates.length > 0) {
    try {
      // a) Existierende Pending-Werte aus KV laden
      const { value: existing } = await kvInstance.get<SchemaUpdate[]>(
        ["pendingUpdates"],
      );
      const oldPending = Array.isArray(existing) ? existing : [];

      // b) Neue Drifts ergänzen (Key-Duplikate überschreiben alte)
      const mergedMap = new Map<string, SchemaUpdate>();
      for (const pu of oldPending) {
        mergedMap.set(pu.key, pu);
      }
      for (const su of schemaUpdates) {
        mergedMap.set(su.key, su);
      }
      const newPending = Array.from(mergedMap.values());

      // c) Speichern
      await kvInstance.set(["pendingUpdates"], newPending);
      console.log(
        `✅ ${schemaUpdates.length} Schema-Drift(s) als pending in KV gespeichert.`,
      );
    } catch (err) {
      console.error("❌ Fehler beim Speichern der Pending-Updates in KV:", err);
    }
  } else {
    console.log("✅ Keine Schema-Drifts, keine Pending-Updates gesetzt.");
  }
}

if (import.meta.main) {
  const dryRunFlag = Deno.args.includes("--dry-run") ||
    Deno.env.get("DRY_RUN") === "true";
  await runAllTests({ dryRun: dryRunFlag });
}
