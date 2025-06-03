import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import type { Block } from "./renderHeaderBlock.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult, VersionUpdate } from "../../types.ts";

const MAX_BLOCKS_PER_MESSAGE = 50;

function numberEmoji(n: number): string {
  const digitMap: Record<string, string> = {
    "0": "0️⃣",
    "1": "1️⃣",
    "2": "2️⃣",
    "3": "3️⃣",
    "4": "4️⃣",
    "5": "5️⃣",
    "6": "6️⃣",
    "7": "7️⃣",
    "8": "8️⃣",
    "9": "9️⃣",
  };
  return n
    .toString()
    .split("")
    .map((digit) => digitMap[digit] ?? digit)
    .join("");
}

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
  approver?: string,
): Promise<void> {
  const allIssues = testResults.filter((r) =>
    r.expectedMissing ||
    r.missingFields.length > 0 ||
    r.extraFields.length > 0 ||
    r.typeMismatches.length > 0
  );

  const { value: approvalsValue } = await kvInstance.get<
    Record<string, string>
  >(
    ["approvals"],
  );
  const approvals = approvalsValue ?? {};

  const pendingIssues = allIssues.filter((r) => {
    const key = r.endpointName.replace(/\s+/g, "_");
    return approvals[key] === undefined || approvals[key] === "pending";
  });

  const headerBlocks = renderHeaderBlock(
    new Date().toLocaleDateString("de-DE"),
  ) as Block[];

  if (approver) {
    headerBlocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `*Freigegeben von:* <!subteam^${approver}>`,
      }],
    });
  }

  const versionBlocks =
    (versionUpdates.length > 0
      ? renderVersionBlocks(versionUpdates)
      : []) as Block[];

  const statsBlocks = renderStatsBlock(
    testResults.length,
    testResults.length - allIssues.length,
    0,
    allIssues.length,
  ) as Block[];

  if (pendingIssues.length === 0) {
    for (const { token, channel } of getSlackWorkspaces()) {
      const blocks: Block[] = [
        ...headerBlocks,
        ...versionBlocks,
        ...statsBlocks,
      ];
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
    console.log("📩 Slack-Report (keine pending-Issues) abgeschlossen.");
    return;
  }

  for (const { token, channel } of getSlackWorkspaces()) {
    const allBodyBlocks: Block[] = [];
    const rawBlocksMap = new Map<string, Block[]>();

    pendingIssues.forEach((r, idx) => {
      const key = r.endpointName.replace(/\s+/g, "_");
      const blocks: Block[] = [];

      const icon = r.expectedMissing || r.missingFields.length > 0
        ? "🔴"
        : (r.extraFields.length > 0 || r.typeMismatches.length > 0)
        ? "🟠"
        : "⚪️";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${numberEmoji(idx + 1)} *${r.endpointName}* ${icon}`,
        },
      });

      if (r.expectedMissing) {
        blocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `❌ Erwartetes Schema *${r.expectedFile}* fehlt.`,
          }],
        });
      } else {
        if (r.missingFields.length > 0) {
          const missing = r.missingFields
            .map((m) => m.replace(/^data(\[0\])?\./, ""))
            .join(", ");
          blocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `❌ Fehlende Felder: ${missing}`,
            }],
          });
        }
        if (r.extraFields.length > 0) {
          const extra = r.extraFields
            .map((e) => e.replace(/^data(\[0\])?\./, ""))
            .join(", ");
          blocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `➕ Neue Felder: ${extra}`,
            }],
          });
        }
        if (r.typeMismatches.length > 0) {
          const types = r.typeMismatches
            .map((tm) =>
              `• ${
                tm.path.replace(/^data(\[0\])?\./, "")
              }: erwartet \`${tm.expected}\`, erhalten \`${tm.actual}\``
            )
            .join("\n");
          blocks.push({
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `⚠️ *Typabweichungen:*\n${types}`,
            }],
          });
        }
      }

      blocks.push({ type: "divider" });
      blocks.push({
        type: "actions",
        block_id: `decision_buttons_${key}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Einverstanden" },
            style: "primary",
            action_id: "open_pin_modal",
            value: JSON.stringify({
              endpointName: r.endpointName,
              method: r.method,
              missing: r.missingFields,
              extra: r.extraFields,
              typeMismatches: r.typeMismatches,
            }),
          },
          {
            type: "button",
            text: { type: "plain_text", text: "⏸️ Warten" },
            style: "danger",
            action_id: "wait_action",
            value: key,
          },
        ],
      });
      blocks.push({ type: "divider" });

      allBodyBlocks.push(...blocks);
      rawBlocksMap.set(key, blocks);
    });

    const headerCount = headerBlocks.length + versionBlocks.length;
    const footerCount = statsBlocks.length;
    const maxPerPage = Math.max(
      1,
      MAX_BLOCKS_PER_MESSAGE - headerCount - footerCount,
    );
    const pages = chunkArray(allBodyBlocks, maxPerPage);

    for (let i = 0; i < pages.length; i++) {
      const blocks: Block[] = [
        ...(i === 0 ? headerBlocks : []),
        ...(i === 0 ? versionBlocks : []),
        ...pages[i],
        ...(i === pages.length - 1 ? statsBlocks : []),
      ];

      const resp = await axios.post("https://slack.com/api/chat.postMessage", {
        channel,
        text: `API Testbericht – Seite ${i + 1}/${pages.length}`,
        blocks,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const postedTs = resp.data.ts as string;
      console.log(`▶️ Beitrag gesendet, ts=${postedTs}`);

      for (const [key, blks] of rawBlocksMap) {
        await kvInstance.set(["rawBlocks", key], {
          blocks: blks,
          ts: postedTs,
        });
      }
    }
  }

  console.log("📩 Slack-Report (pending-Issues) abgeschlossen.");
}
