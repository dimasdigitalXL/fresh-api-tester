// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import type { TestResult } from "../../apiCaller.ts";

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: VersionUpdate[] = [], // <— korrekter Default: leeres Array
): Promise<void> {
  const workspaces = getSlackWorkspaces();
  if (workspaces.length === 0) {
    console.warn("Kein Slack-Workspace konfiguriert – überspringe Report.");
    return;
  }

  // 1) Header & Datum
  const today = new Date().toLocaleDateString("de-DE");
  const header = renderHeaderBlock(today);

  // 2) Version-Updates, falls vorhanden
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];

  // 3) Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  const stats = renderStatsBlock(total, success, warnings, criticals);

  // 4) Alle fehlschlagenden Tests als Issue-Blocks
  const failing = testResults.filter((r) => !r.success || r.isCritical);
  const issues = failing.flatMap((res) => {
    const suffix = res.endpointName.replace(/\s+/g, "_");
    return renderIssueBlocks([res]).map((blk) => {
      const b = { ...blk } as Record<string, unknown>;
      if (typeof b.block_id === "string") {
        b.block_id = `${b.block_id}_${suffix}`;
      }
      return b;
    });
  });

  // 5) Blocks zusammenfügen
  const blocks = [
    ...header,
    ...versions,
    ...stats,
    { type: "divider" },
    ...issues,
    { type: "divider" },
  ];

  // 6) Echte Slack-Nachricht senden
  for (const { token, channel } of workspaces) {
    const payload = blocks.length > 50
      ? {
        channel,
        text: `API Testbericht: ${
          warnings + criticals
        } Abweichungen (insgesamt ${total}).`,
      }
      : {
        channel,
        text: "API Testbericht",
        blocks,
      };

    try {
      const resp = await axios.post(
        "https://slack.com/api/chat.postMessage",
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("▶️ Slack API chat.postMessage response:", resp.data);
    } catch (err) {
      console.error("❌ Fehler beim Senden an Slack:", err);
    }
  }

  console.log("📩 Slack-Testbericht abgeschlossen.");
}
