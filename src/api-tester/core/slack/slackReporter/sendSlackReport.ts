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

// Maximal 50 Blocks pro Slack-Message
const MAX_BLOCKS_PER_MESSAGE = 50;

// Hilfsfunktion: Array in Stücke aufteilen
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
  // 1) Nur echte Schema-Issues
  const schemaIssues = testResults.filter((r) =>
    r.expectedMissing ||
    r.missingFields.length > 0 ||
    r.extraFields.length > 0 ||
    r.typeMismatches.length > 0
  );

  // 2) Bausteine für Nachricht
  const headerBlocks = renderHeaderBlock(
    new Date().toLocaleDateString("de-DE"),
  );
  const versionBlocks = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];
  const missingSchemaBlocks = schemaIssues
    .filter((r) => r.expectedMissing)
    .map((r) => ({
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text:
          `:warning: Erwartetes Schema *${r.expectedFile}* für Endpoint *${r.endpointName}* fehlt.`,
      },
    }));
  const issueBlocks = schemaIssues
    .filter((r) => !r.expectedMissing)
    .flatMap((res) => {
      const suffix = res.endpointName.replace(/\s+/g, "_");
      return renderIssueBlocks([res]).map((blk) => {
        const b = { ...blk } as Record<string, unknown>;
        if (typeof b.block_id === "string") {
          b.block_id = `${b.block_id}_${suffix}`;
        }
        return b;
      });
    });
  const statsBlocks = renderStatsBlock(
    testResults.length,
    testResults.length - schemaIssues.length,
    0,
    schemaIssues.length,
  );

  // 3) Blocks chunken
  const bodyBlocks = [...missingSchemaBlocks, ...issueBlocks];
  const headerCount = headerBlocks.length + versionBlocks.length;
  const footerCount = statsBlocks.length;
  const maxPerChunk = Math.max(
    1,
    MAX_BLOCKS_PER_MESSAGE - headerCount - footerCount,
  );
  const issueChunks = chunkArray(bodyBlocks, maxPerChunk);

  // 4) Approvals in KV speichern
  {
    const { value: existing } = await kvInstance.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = existing ?? {};
    for (const res of schemaIssues) {
      const key = res.endpointName.replace(/\s+/g, "_");
      const raw = renderIssueBlocks([res]);
      await kvInstance.set(["rawBlocks", key], raw);
      approvals[key] = "pending";
    }
    await kvInstance.set(["approvals"], approvals);
  }

  // 5) Nachrichten senden
  const workspaces = getSlackWorkspaces();
  for (const { token, channel } of workspaces) {
    // a) Mehrere Nachrichten, falls nötig
    for (let i = 0; i < issueChunks.length; i++) {
      const blocks = [
        ...(i === 0 ? headerBlocks : []),
        ...(i === 0 ? versionBlocks : []),
        ...issueChunks[i],
        ...(i === issueChunks.length - 1 ? statsBlocks : []),
      ];
      try {
        const resp = await axios.post(
          "https://slack.com/api/chat.postMessage",
          {
            channel,
            text: `API Testbericht – Seite ${i + 1}/${issueChunks.length}`,
            blocks,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        console.log("▶️ Slack chat.postMessage:", resp.data);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("❌ Fehler beim Senden an Slack:", errMsg);
      }
    }

    // b) Wenn keine SchemaIssues existieren
    if (issueChunks.length === 0) {
      try {
        const resp = await axios.post(
          "https://slack.com/api/chat.postMessage",
          {
            channel,
            text: "API Testbericht – keine Schema-Abweichungen",
            blocks: [...headerBlocks, ...versionBlocks, ...statsBlocks],
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        console.log("▶️ Slack chat.postMessage (no issues):", resp.data);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("❌ Fehler beim Senden an Slack (no issues):", errMsg);
      }
    }
  }

  console.log("📩 Slack-Testbericht abgeschlossen.");
}
