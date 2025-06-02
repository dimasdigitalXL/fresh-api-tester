// src/api-tester/core/slack/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import type { Block } from "./renderHeaderBlock.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";
import type { VersionUpdate } from "../../endpointRunner.ts";

const MAX_BLOCKS_PER_MESSAGE = 50;

/**
 * Liefert für jede Ziffer von n das entsprechende Keycap-Emoji.
 */
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

/** Teilt ein Array in Chunks der Länge `size` */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sendet den Slack-Testbericht. Wenn `approver` gesetzt ist, wird
 * ein zusätzlicher Hinweisblock ("Freigegeben von @user") eingefügt.
 *
 * Dabei speichern wir für jeden Issue-Block gleichzeitig den Slack‐Timestamp (ts) in KV,
 * damit wir später über `chat.update` genau wissen, welche Nachricht wir updaten müssen.
 */
export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: VersionUpdate[] = [],
  approver?: string,
): Promise<void> {
  // 1) Alle Ergebnisse mit Schema-Issues sammeln
  const allIssues = testResults.filter((r) =>
    r.expectedMissing ||
    r.missingFields.length > 0 ||
    r.extraFields.length > 0 ||
    r.typeMismatches.length > 0
  );

  // 2) Approval-Status aus KV laden
  const { value: approvalsValue } = await kvInstance.get<
    Record<string, string>
  >(
    ["approvals"],
  );
  const approvals = approvalsValue ?? {};

  // 3) Nur die mit Status "pending" oder noch nicht gesetzt
  const pendingIssues = allIssues.filter((r) => {
    const key = r.endpointName.replace(/\s+/g, "_");
    return approvals[key] === undefined || approvals[key] === "pending";
  });

  // 4) Header-, Versions- und Statistik-Blöcke vorbereiten
  const headerBlocks = renderHeaderBlock(
    new Date().toLocaleDateString("de-DE"),
  ) as Block[];

  // Wenn ein Approver übergeben wurde, füge Kontext-Block hinzu
  if (approver) {
    headerBlocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Freigegeben von:* <!subteam^${approver}>`,
        },
      ],
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

  // → Keine offenen Issues? Dann Nur-Statistik senden
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

  // 5) Für jede offene Issue bauen wir Slack-Blöcke und posten sie einzeln mit 'chat.postMessage'.
  //    Wir merken uns das zurückgelieferte `ts` pro Schlüssel (key), damit wir später ein `chat.update` auf genau diese Nachricht machen können.
  for (const { token, channel } of getSlackWorkspaces()) {
    // Wir schicken alles in nur einem Post, aber speichern dennoch pro Issue den ts
    const allBodyBlocks: Block[] = [];
    const rawBlocksMap = new Map<string, Block[]>();

    pendingIssues.forEach((r, idx) => {
      const key = r.endpointName.replace(/\s+/g, "_");
      const blocks: Block[] = [];

      // A) Section mit durchnummeriertem Emoji
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

      // B) Kontext-Details
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

      // C) Divider + Action-Buttons (mit echtem `ts` im Payload) + Divider
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
              // Die ts setzen wir erst, sobald wir hier tatsächlich posten
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

    // 6) Pagination: Wir schaﬀen Seiten von Blöcken, damit Slack nicht die 50‐Block‐Grenze überschreitet
    const headerCount = headerBlocks.length + versionBlocks.length;
    const footerCount = statsBlocks.length;
    const maxPerPage = Math.max(
      1,
      MAX_BLOCKS_PER_MESSAGE - headerCount - footerCount,
    );
    const pages = chunkArray(allBodyBlocks, maxPerPage);

    // 7) Pro Seite → eine `chat.postMessage` ausführen und das `ts` abspeichern
    for (let i = 0; i < pages.length; i++) {
      const blocks: Block[] = [
        ...(i === 0 ? headerBlocks : []),
        ...(i === 0 ? versionBlocks : []),
        ...pages[i],
        ...(i === pages.length - 1 ? statsBlocks : []),
      ];

      // 7a) Nachricht senden
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

      // 7b) Speichere für jedes Issue desselben Blocks den `ts` unter rawBlocks:<key>
      //     → rawBlocksMap hat für jeden `key` genau die Blöcke, aber wir tragen den gemeinsam geposteten `ts` mit ein.
      for (const [key, blks] of rawBlocksMap) {
        // Speichern eines Objektes { blocks, ts } statt nur blocks
        await kvInstance.set(["rawBlocks", key], {
          blocks: blks,
          ts: postedTs,
        });
      }
    }
  }

  console.log("📩 Slack-Report (pending-Issues) abgeschlossen.");
}
