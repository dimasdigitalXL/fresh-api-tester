// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

/**
 * Sendet den API-Testbericht an alle konfigurierten Slack-Workspaces.
 * Schreibt außerdem die rohen Issue-Blocks und initialen Approval-Status ins KV.
 */
export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: Array<{ name: string; url: string }> = [],
  options: { dryRun?: boolean } = {},
): Promise<void> {
  // 1) Workspaces auslesen
  const workspaces = getSlackWorkspaces();
  console.log("🔧 Slack Workspaces:", workspaces);

  // 2) Statistik berechnen
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  console.log(
    `📊 Gesamt: ${total}, ✅ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
  );

  // 3) Blocks zusammenbauen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
  const failing = testResults.filter((r) => !r.success || r.isCritical);

  // Jedes Issue-Block-Array so anpassen, dass action-block_ids eindeutig sind
  const issues = failing.flatMap((result) => {
    const key = result.endpointName.replace(/\s+/g, "_");
    const singleBlocks = renderIssueBlocks([result]);
    return singleBlocks.map((block) => {
      if (block.type === "actions" && block.block_id === "decision_buttons") {
        return { ...block, block_id: `decision_buttons_${key}` };
      }
      return block;
    });
  });

  const stats = renderStatsBlock(total, success, warnings, criticals);
  const blocks = [...header, ...versions, ...issues, ...stats];

  // 3.1) Debug: vor dem Senden ansehen
  console.log("▶️ Blocks, die wir an Slack schicken wollen:");
  console.log(JSON.stringify(blocks, null, 2));

  // ────────────────────────────────────────────────────────────
  // 4) Rohe Issue-Blocks & initialen Status ins KV schreiben
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
  // ────────────────────────────────────────────────────────────

  // 5) Fallback falls zu viele Blocks (>50)
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

  // 6) Endgültige Nachricht mit Block-Kit senden
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
