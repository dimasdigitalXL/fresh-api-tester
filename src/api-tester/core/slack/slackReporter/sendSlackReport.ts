import axios from "https://esm.sh/axios@1.4.0";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

/**
 * Sendet den API-Testbericht an alle konfigurierten Slack-Workspaces.
 */
export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: Array<{ name: string; url: string }> = [],
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const workspaces = getSlackWorkspaces();

  // 1) Logge die Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;

  console.log(`📊 Gesamtstatistik: ${total} API-Aufrufe`);
  console.log(`✅ Erfolgreich: ${success}`);
  console.log(`⚠️ Warnungen: ${warnings}`);
  console.log(`🔴 Kritisch: ${criticals}`);

  // 2) Wenn zu viele kritische Fehler sind, logge sie
  if (criticals > 0) {
    console.log("⚠️ Kritische Fehler bei den folgenden Endpunkten:");
    testResults.filter((r) => r.isCritical).forEach((r) => {
      console.log(`- ${r.endpointName} (${r.method})`);
      console.log(
        `  Fehlerdetails: ${r.errorDetails ?? "Keine weiteren Details"}`,
      );
    });
  }

  // 3) Weiter mit dem Block-Kit
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];

  // Hier wird `renderIssueBlocks` mit allen Fehlern und fehlenden Feldern aufgerufen
  const issues = renderIssueBlocks(
    testResults.filter((r) => !r.success || r.isCritical),
  );

  const stats = renderStatsBlock(total, success, warnings, criticals);

  // 4) Blöcke zusammenstellen
  const blocks = [...header, ...versions, ...issues, ...stats];

  // 5) Zu viele Blöcke? → kompakte Fallback-Nachricht
  if (blocks.length > 50) {
    const fallback = [
      `🔍 *API Testbericht*`,
      `⚠️ *${warnings + criticals} Abweichungen*`,
      `📊 Gesamt: ${total}, ✔️ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
    ].join("\n");

    for (const { token, channel } of workspaces) {
      if (options.dryRun) continue;
      await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel, text: fallback },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log("📩 Fallback-Slack-Nachricht gesendet.");
    return;
  }

  // 6) Poste die Block-Kit-Nachricht
  for (const { token, channel } of workspaces) {
    if (options.dryRun) continue;
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel,
        text: "API Testbericht",
        blocks,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
  }

  console.log("📩 Slack-Testbericht gesendet.");
}
