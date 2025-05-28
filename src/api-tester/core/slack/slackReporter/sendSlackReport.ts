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
  >(["approvals"]);
  const approvals = approvalsValue ?? {};

  // 3) Neu entdeckte Issues initial auf "pending" setzen
  for (const r of allIssues) {
    const key = r.endpointName.replace(/\s+/g, "_");
    if (!(key in approvals)) {
      approvals[key] = "pending";
    }
  }
  await kvInstance.set(["approvals"], approvals);

  // 4) Nur noch die tatsächlich pending-Issues anzeigen
  const pendingIssues = allIssues.filter((r) => {
    const key = r.endpointName.replace(/\s+/g, "_");
    return approvals[key] === "pending";
  });

  // 5) Header-, Version- und Statistik-Blöcke bauen
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

  // 6) Kein pending → kurzer Report ohne Buttons
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

  // 7) Baue für jede pending-Issue die Blöcke (inkl. Buttons)
  const issueBlocks = pendingIssues.flatMap((res) => {
    const suffix = res.endpointName.replace(/\s+/g, "_");
    return renderIssueBlocks([res]).map((blk) => ({
      ...blk,
      block_id: typeof blk.block_id === "string"
        ? `${blk.block_id}_${suffix}`
        : blk.block_id,
    }));
  });

  // 8) Speichere rawBlocks (für das PIN-Modal), ohne das block_id-Feld
  for (const res of pendingIssues) {
    const key = res.endpointName.replace(/\s+/g, "_");
    const raw = renderIssueBlocks([res]).map((blk) => {
      const { block_id: _block_id, ...rest } = blk as Record<string, unknown>;
      return rest;
    });
    await kvInstance.set(["rawBlocks", key], raw);
  }

  // 9) Nachrichten in handliche Chunk-Größen aufteilen und senden
  const bodyBlocks = issueBlocks;
  const headerCount = headerBlocks.length + versionBlocks.length;
  const footerCount = statsBlocks.length;
  const maxPerChunk = Math.max(
    1,
    MAX_BLOCKS_PER_MESSAGE - headerCount - footerCount,
  );
  const chunks = chunkArray(bodyBlocks, maxPerChunk);

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
