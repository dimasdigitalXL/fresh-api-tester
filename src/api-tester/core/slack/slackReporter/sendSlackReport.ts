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
  console.log("🔧 Slack Workspaces:", workspaces);

  // 1) Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;

  console.log(`📊 Gesamtstatistik: ${total} API-Aufrufe`);
  console.log(`✅ Erfolgreich: ${success}`);
  console.log(`⚠️ Warnungen: ${warnings}`);
  console.log(`🔴 Kritisch: ${criticals}`);

  if (criticals > 0) {
    console.log("⚠️ Kritische Fehler bei den folgenden Endpunkten:");
    testResults.filter((r) => r.isCritical).forEach((r) => {
      console.log(`- ${r.endpointName} (${r.method})`);
      console.log(
        `  Fehlerdetails: ${r.errorDetails ?? "Keine weiteren Details"}`,
      );
    });
  }

  // 2) Bausteine bauen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
  const issues = renderIssueBlocks(
    testResults.filter((r) => !r.success || r.isCritical),
  );
  const stats = renderStatsBlock(total, success, warnings, criticals);

  // 3) Vollständige Blocks
  const fullBlocks = [...header, ...versions, ...issues, ...stats];

  // 4) Fallback-Logik: wenn >50 Blocks, statt Plain-Text nur kompakt Header+Issues+Stats senden
  if (fullBlocks.length > 50) {
    console.warn(
      `⚠️ Blocks (${fullBlocks.length}) > 50 → sende gekürzte Nachricht mit Buttons`,
    );
    const truncatedBlocks = [...header, ...issues, ...stats];

    for (const { token, channel } of workspaces) {
      if (options.dryRun) continue;
      await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel,
          text: "API Testbericht (gekürzt)", // Fallback-Text
          blocks: truncatedBlocks,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log("📩 Gekürzte Slack-Nachricht gesendet.");
    return;
  }

  // 5) Sind fewer als 50, sende komplette Nachricht
  for (const { token, channel } of workspaces) {
    if (options.dryRun) continue;
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel,
        text: "API Testbericht",
        blocks: fullBlocks,
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
