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
  const workspaces = getSlackWorkspaces();
  console.log("🔧 Slack Workspaces:", workspaces);

  // 1) Statistik berechnen
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  console.log(
    `📊 Gesamt: ${total}, ✅ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
  );

  // 2) Basis-Blöcke bauen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];

  // 3) Issue-Blocks (inkl. Action-Buttons) pro fehlerhaftem Endpunkt
  const failing = testResults.filter((r) => !r.success || r.isCritical);
  const issues = failing.flatMap((result) => {
    const key = result.endpointName.replace(/\s+/g, "_");
    // renderIssueBlocks liefert für EIN Ergebnis:
    // [ section, context?, divider, actions, divider ]
    const blocks = renderIssueBlocks([result]);
    return blocks.map((block) => {
      // alle „decision_buttons“ eindeutig machen
      if (block.type === "actions" && block.block_id === "decision_buttons") {
        return {
          ...block,
          block_id: `decision_buttons_${key}`,
        };
      }
      return block;
    });
  });

  const stats = renderStatsBlock(total, success, warnings, criticals);
  const blocks = [...header, ...versions, ...issues, ...stats];

  console.log(
    "▶️ Blocks, die wir an Slack schicken wollen:",
    JSON.stringify(blocks, null, 2),
  );

  // 4) Raw-Blocks & initialen Approval-Status ins KV schreiben
  {
    const kv = await kvInstance;
    const { value: stored } = await kv.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = stored ?? {};
    for (const result of failing) {
      const key = result.endpointName.replace(/\s+/g, "_");
      const singleBlocks = renderIssueBlocks([result]);
      await kv.set(["rawBlocks", key], singleBlocks);
      approvals[key] = "pending";
    }
    await kv.set(["approvals"], approvals);
    console.log("✅ KV: rawBlocks & approvals initial gespeichert");
  }

  // 5) Fallback, falls > 50 Blocks
  if (blocks.length > 50) {
    const fallback = [
      `🔍 *API Testbericht*`,
      `⚠️ *${warnings + criticals} Abweichungen*`,
      `📊 Gesamt: ${total}, ✔️ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
    ].join("\n");
    for (const { token, channel } of workspaces) {
      if (options.dryRun) continue;
      const resp = await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel, text: fallback },
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

  // 6) Block-Kit Nachricht mit Buttons senden
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
