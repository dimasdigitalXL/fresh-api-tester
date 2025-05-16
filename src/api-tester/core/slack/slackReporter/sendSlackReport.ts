// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * Sendet immer den echten Report an Slack (kein Dry-Run mehr).
 */
export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: VersionUpdate[] = [],
): Promise<void> {
  const workspaces = getSlackWorkspaces();

  // Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings = testResults.filter(
    (r) =>
      !r.success &&
      !r.isCritical &&
      r.expectedMissing !== true,
  ).length;
  const criticals = testResults.filter((r) => r.isCritical).length;

  // Failing = echte Diff-Issues oder fehlende Datei
  const failing = testResults.filter((r) =>
    r.expectedMissing === true ||
    r.missingFields.length > 0 ||
    r.extraFields.length > 0 ||
    (r.typeMismatches.length > 0) ||
    r.isCritical
  );

  // Blocks bauen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
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
  const stats = renderStatsBlock(total, success, warnings, criticals);
  const blocks = [...header, ...versions, ...issues, ...stats];

  // Raw-Blocks & Approvals in KV
  {
    const { value: existing } = await kvInstance.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = existing ?? {};
    for (const res of failing) {
      const key = res.endpointName.replace(/\s+/g, "_");
      const raw = renderIssueBlocks([res]);
      await kvInstance.set(["rawBlocks", key], raw);
      approvals[key] = "pending";
    }
    await kvInstance.set(["approvals"], approvals);
  }

  // Nachricht an Slack senden
  for (const { token, channel } of workspaces) {
    const payload = blocks.length > 50
      ? {
        channel,
        text: `API Testbericht: ${
          warnings + criticals
        } Abweichungen (insgesamt ${total}).`,
      }
      : { channel, text: "API Testbericht", blocks };

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
