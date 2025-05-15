// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios, { type AxiosResponse } from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

interface SlackWorkspace {
  token: string;
  channel: string;
  signingSecret: string;
}

interface SlackPostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  error?: string;
}

export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: Array<{ name: string; url: string }> = [],
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const workspaces: SlackWorkspace[] = getSlackWorkspaces();
  console.log("🔧 Slack Workspaces:", workspaces);

  // 1) Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  console.log(
    `📊 Gesamt: ${total}, ✅ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
  );

  // 2) Blocks zusammensetzen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length
    ? renderVersionBlocks(versionUpdates)
    : [];
  const failing = testResults.filter((r) => !r.success || r.isCritical);

  // Jede Issue-Block-Gruppe bekommt eine eindeutige block_id
  const issues = failing.flatMap((result) => {
    const key = result.endpointName.replace(/\s+/g, "_");
    return renderIssueBlocks([result]).map((blk) => {
      const b = { ...blk } as { type: string; block_id?: string };
      if (b.block_id) b.block_id = `${b.block_id}_${key}`;
      return b;
    });
  });

  const stats = renderStatsBlock(total, success, warnings, criticals);
  const blocks = [...header, ...versions, ...issues, ...stats];
  console.log(
    "▶️ Blocks, die wir an Slack schicken wollen:",
    JSON.stringify(blocks, null, 2),
  );

  // 3) Raw-Blocks & Approvals initial ins KV schreiben
  {
    const { value: existing } = await kvInstance.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = existing ?? {};
    for (const result of failing) {
      const key = result.endpointName.replace(/\s+/g, "_");
      await kvInstance.set(["rawBlocks", key], renderIssueBlocks([result]));
      approvals[key] = "pending";
    }
    await kvInstance.set(["approvals"], approvals);
    console.log("✅ KV: rawBlocks & approvals initial gespeichert");
  }

  // 4) Fallback, falls zu viele Blocks
  if (blocks.length > 50) {
    const fallbackText = [
      `🔍 *API Testbericht*`,
      `⚠️ *${warnings + criticals} Abweichungen*`,
      `📊 Gesamt: ${total}, ✔️ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
    ].join("\n");
    for (const ws of workspaces) {
      if (options.dryRun) continue;
      const resp: AxiosResponse<SlackPostMessageResponse> = await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel: ws.channel, text: fallbackText },
        {
          headers: {
            Authorization: `Bearer ${ws.token}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("▶️ Slack API Fallback response:", resp.data);
    }
    return;
  }

  // 5) Block-Kit Nachricht senden
  for (const ws of workspaces) {
    if (options.dryRun) continue;
    const resp: AxiosResponse<SlackPostMessageResponse> = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel: ws.channel, text: "API Testbericht", blocks },
      {
        headers: {
          Authorization: `Bearer ${ws.token}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("▶️ Slack API chat.postMessage response:", resp.data);
  }

  console.log("📩 Slack-Testbericht gesendet.");
}
