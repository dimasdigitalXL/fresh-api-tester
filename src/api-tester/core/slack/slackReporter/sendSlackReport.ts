// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

/** Version-Updates, die im Report angezeigt werden können */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

const MAX_BLOCKS_PER_MESSAGE = 50;

/** Teilt ein Array in gleich große Chunks */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: VersionUpdate[] = [],
): Promise<void> {
  // 1) Ermittele alle Schema-Issues
  const allIssues = testResults.filter((r) =>
    r.expectedMissing ||
    r.missingFields.length > 0 ||
    r.extraFields.length > 0 ||
    r.typeMismatches.length > 0
  );

  // 2) Lese aktuellen Approval-Status aus KV
  const { value: approvalsValue } = await kvInstance.get<
    Record<string, string>
  >(
    ["approvals"],
  );
  const approvals = approvalsValue ?? {};

  // 3) Filtere nur die, die noch "pending" sind
  const pendingIssues = allIssues.filter((r) => {
    const key = r.endpointName.replace(/\s+/g, "_");
    return approvals[key] === "pending";
  });

  // 4) Bausteine bauen
  const headerBlocks = renderHeaderBlock(
    new Date().toLocaleDateString("de-DE"),
  );
  const versionBlocks = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
  const statsBlocks = renderStatsBlock(
    testResults.length,
    testResults.length - allIssues.length,
    0,
    allIssues.length,
  );

  // 5) Wenn keine pending-Issues übrig sind → No-Issues-Report
  if (pendingIssues.length === 0) {
    const workspaces = getSlackWorkspaces();
    for (const { token, channel } of workspaces) {
      const blocks = [...headerBlocks, ...versionBlocks, ...statsBlocks];
      await axios.post("https://slack.com/api/chat.postMessage", {
        channel,
        text: "API Testbericht – keine neuen Schema-Abweichungen",
        blocks,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    }
    console.log("📩 Slack-Testbericht (keine pending-Issues) abgeschlossen.");
    return;
  }

  // 6) Blocks für fehlende Schema-Dateien
  const missingSchemaBlocks = pendingIssues
    .filter((r) => r.expectedMissing)
    .map((r) => ({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text:
          `:warning: Erwartetes Schema *${r.expectedFile}* für Endpoint *${r.endpointName}* fehlt.`,
      },
    }));

  // 7) Einmalig alle Issue-Blocks rendern, damit Index korrekt ist
  const rawIssueBlocks = renderIssueBlocks(pendingIssues);

  // 8) Unique block_id-Suffix anhängen (Action-Buttons)
  const issueBlocks = rawIssueBlocks.map((blk) => {
    if (blk.type === "actions" && typeof blk.block_id === "string") {
      const suffix = blk.block_id.replace(/^decision_buttons_/, "");
      return {
        ...blk,
        block_id: `${blk.block_id}_${suffix}`,
      };
    }
    return blk;
  });

  // 9) Chunks bauen
  const bodyBlocks = [...missingSchemaBlocks, ...issueBlocks];
  const headerCount = headerBlocks.length + versionBlocks.length;
  const footerCount = statsBlocks.length;
  const maxPerChunk = Math.max(
    1,
    MAX_BLOCKS_PER_MESSAGE - headerCount - footerCount,
  );
  const chunks = chunkArray(bodyBlocks, maxPerChunk);

  // 10) rawBlocks für Modal-Submission speichern
  for (const res of pendingIssues) {
    const key = res.endpointName.replace(/\s+/g, "_");
    const raw = renderIssueBlocks([res]);
    await kvInstance.set(["rawBlocks", key], raw);
  }

  // 11) Chunks an Slack senden
  const workspaces = getSlackWorkspaces();
  for (const { token, channel } of workspaces) {
    for (let i = 0; i < chunks.length; i++) {
      const blocks = [
        ...(i === 0 ? headerBlocks : []),
        ...(i === 0 ? versionBlocks : []),
        ...chunks[i],
        ...(i === chunks.length - 1 ? statsBlocks : []),
      ];
      await axios.post("https://slack.com/api/chat.postMessage", {
        channel,
        text: `API Testbericht – Seite ${i + 1}/${chunks.length}`,
        blocks,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    }
  }

  console.log("📩 Slack-Testbericht (pending-Issues) abgeschlossen.");
}
