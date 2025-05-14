// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

// Minimaler Typ für Slack-Blocks mit optionalem block_id
type SlackBlock = {
  type: string;
  block_id?: string;
  [key: string]: unknown;
};

export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: Array<{ name: string; url: string }> = [],
  options: { dryRun?: boolean } = {},
): Promise<void> {
  // 1) Slack-Workspaces holen
  const workspaces = getSlackWorkspaces();
  console.log("🔧 Slack Workspaces:", workspaces);

  // 2) Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  console.log(
    `📊 Gesamt: ${total}, ✅ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
  );

  // 3) Header- und Version-Blocks
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];

  // 4) Issue-Blocks (einmal pro Endpunkt)
  const failing = testResults.filter((r) => !r.success || r.isCritical);
  const issues: SlackBlock[] = [];
  for (const result of failing) {
    const key = result.endpointName.replace(/\s+/g, "_");
    // Wir wissen, dass renderIssueBlocks() SlackBlock-ähnliche Objekte liefert
    const blocksForThis = (renderIssueBlocks([result]) as SlackBlock[])
      .map((block, _idx) => {
        const original = block.block_id;
        return {
          ...block,
          block_id: original ? `${original}_${key}_${_idx}` : `${key}_${_idx}`,
        };
      });
    issues.push(...blocksForThis);
  }

  // 5) Stats-Block
  const stats = renderStatsBlock(total, success, warnings, criticals);

  // Zusammensetzen aller Blocks
  const blocks = [
    ...header,
    ...versions,
    ...issues,
    ...stats,
  ];

  // Debug-Ausgabe
  console.log("▶️ Blocks, die wir an Slack schicken wollen:");
  console.log(JSON.stringify(blocks, null, 2));

  // ─── 6) Raw-Blocks & Approvals initial ins KV ──────────────────────
  {
    const kv = await kvInstance;
    const res = await kv.get<Record<string, string>>(["approvals"]);
    const approvals = res.value ?? {};
    for (const result of failing) {
      const key = result.endpointName.replace(/\s+/g, "_");
      const endpointBlocks = renderIssueBlocks([result]);
      await kv.set(["rawBlocks", key], endpointBlocks);
      approvals[key] = "pending";
    }
    await kv.set(["approvals"], approvals);
    console.log("✅ KV: rawBlocks & approvals initial gespeichert");
  }
  // ──────────────────────────────────────────────────────────────────

  // 7) Fallback, falls >50 Blocks
  if (blocks.length > 50) {
    const fallbackText = [
      `🔍 *API Testbericht*`,
      `⚠️ *${warnings + criticals} Abweichungen*`,
      `📊 Gesamt: ${total}, ✔️ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
    ].join("\n");
    for (const { token, channel } of workspaces) {
      if (options.dryRun) continue;
      const resp = await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel, text: fallbackText },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("▶️ Slack API Fallback response:", resp.data);
    }
    return;
  }

  // 8) Endgültige Nachricht senden
  for (const { token, channel } of workspaces) {
    if (options.dryRun) continue;
    const resp = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel, text: "API Testbericht", blocks },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("▶️ Slack API chat.postMessage response:", resp.data);
  }

  console.log("📩 Slack-Testbericht gesendet.");
}
