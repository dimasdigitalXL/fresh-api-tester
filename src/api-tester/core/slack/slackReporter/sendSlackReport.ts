// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { Block } from "./renderHeaderBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

/**
 * Sendet den API-Testbericht an alle konfigurierten Slack-Workspaces.
 */
export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: Array<{ name: string; url: string }> = [],
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const workspaces = getSlackWorkspaces();

  // Statistik
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;
  const today = new Date().toLocaleDateString("de-DE");

  // 1) Keine Abweichungen? → kompakte Text-Nachricht
  if (warnings === 0 && criticals === 0) {
    const text = [
      `🔍 *API Testbericht*`,
      `📅 Datum: *${today}*`,
      `✅ Alle Tests erfolgreich. Keine Abweichungen!`,
      `📊 *Gesamt:* ${total}`,
      `• 🟢 Erfolgreich: ${success}`,
      `• 🟠 Warnungen: ${warnings}`,
      `• 🔴 Kritisch: ${criticals}`,
      `📢 Status: 🟢`,
    ].join("\n");

    for (const { token, channel } of workspaces) {
      if (dryRun) continue;
      await axios.post(
        "https://slack.com/api/chat.postMessage",
        { channel, text },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log(
      `📩 Kompakter Slack-Testbericht gesendet an ${workspaces.length} Workspace(s).`,
    );
    return;
  }

  // 2) Block-Kit zusammensetzen
  const header = renderHeaderBlock(today);
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
  const issues = renderIssueBlocks(
    testResults.filter((r) => !r.success || r.isCritical),
  );
  const stats = renderStatsBlock(total, success, warnings, criticals);

  // Zusammenführen und typisieren
  const blocks = ([
    ...header,
    ...versions,
    ...issues,
    ...stats,
  ] as unknown) as Block[];

  // 3) Zu viele Blöcke? → kompakte Fallback-Nachricht
  if (blocks.length > 50) {
    const fallback = [
      `🔍 *API Testbericht* (${today})`,
      `⚠️ *${warnings + criticals} Abweichungen aufgetreten*`,
      `📊 Gesamt: ${total}, ✔️ ${success}, ⚠️ ${warnings}, 🔴 ${criticals}`,
    ].join("\n");

    for (const { token, channel } of workspaces) {
      if (dryRun) continue;
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

    console.log(
      `📩 Fallback-Slack-Nachricht (zu viele Blöcke) gesendet an ${workspaces.length} Workspace(s).`,
    );
    return;
  }

  // 4) Block-IDs entfernen
  const safeBlocks = blocks.map((blk) => {
    const b = { ...blk } as Record<string, unknown>;
    delete b.block_id;
    if (Array.isArray(b.elements)) {
      b.elements = (b.elements as unknown[]).map((el) => {
        const e = { ...(el as Record<string, unknown>) };
        delete e.block_id;
        return e;
      });
    }
    return b as Block;
  });

  // 5) Poste die Block-Kit-Nachricht
  for (const { token, channel } of workspaces) {
    if (dryRun) continue;
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel,
        text: "API Testbericht",
        blocks: safeBlocks,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
  }

  console.log(
    `📩 Slack-Testbericht mit Blocks gesendet an ${workspaces.length} Workspace(s).`,
  );
}
