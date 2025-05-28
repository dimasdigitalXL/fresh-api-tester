// src/api-tester/core/slack/slackReporter/renderIssueBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";

/** Liefert das Keycap-Emoji für die Zahl n (1–10, sonst fallback) */
function numberEmoji(n: number): string {
  const map: Record<number, string> = {
    1: "1️⃣",
    2: "2️⃣",
    3: "3️⃣",
    4: "4️⃣",
    5: "5️⃣",
    6: "6️⃣",
    7: "7️⃣",
    8: "8️⃣",
    9: "9️⃣",
    10: "🔟",
  };
  return map[n] ?? `${n}\u20E3`;
}

/**
 * Ein einzelnes Issue, das gerendert wird.
 * Definiert hier explizit alle benötigten Felder,
 * unabhängig von TestResult.
 */
export interface Issue {
  endpointName: string;
  method: string;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: { path: string; expected: string; actual: string }[];
  isCritical: boolean;
  expectedMissing: boolean;
  expectedFile?: string;
}

/**
 * Erzeugt aus einer Liste von Issues die Slack-Blocks
 */
export function renderIssueBlocks(issues: Issue[]): Block[] {
  return issues.flatMap((issue, index) => {
    const missing = issue.missingFields.map((m) =>
      m.replace(/^data(\[0\])?\./, "")
    );
    const extra = issue.extraFields.map((e) =>
      e.replace(/^data(\[0\])?\./, "")
    );
    const types = issue.typeMismatches.map(
      (m) =>
        `• ${
          m.path.replace(/^data(\[0\])?\./, "")
        }: erwartet ${m.expected}, erhalten ${m.actual}`,
    );

    // Rot = fehlendes Schema oder kritischer Fehler, Gelb = sonstige Abweichungen
    const icon = issue.expectedMissing || issue.isCritical
      ? "🔴"
      : issue.extraFields.length > 0 || issue.typeMismatches.length > 0
      ? "🟠"
      : "⚪️";

    const blocks: Block[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${
            numberEmoji(index + 1)
          } *${issue.endpointName}* \`(${issue.method})\` ${icon}`,
        },
      },
    ];

    // Details
    if (issue.expectedMissing) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              `❌ Erwartete Datei nicht gefunden: \`${issue.expectedFile}\``,
          },
        ],
      });
    } else {
      if (missing.length > 0) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `❌ Fehlende Felder: ${missing.join(", ")}`,
            },
          ],
        });
      }
      if (extra.length > 0) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `➕ Neue Felder: ${extra.join(", ")}`,
            },
          ],
        });
      }
      if (types.length > 0) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `⚠️ *Typabweichungen:*\n${types.join("\n")}`,
            },
          ],
        });
      }
    }

    // Divider + Buttons (falls nötig) + Divider
    blocks.push({ type: "divider" });

    if (
      issue.expectedMissing ||
      issue.isCritical ||
      missing.length > 0 ||
      extra.length > 0 ||
      types.length > 0
    ) {
      const key = issue.endpointName.replace(/\s+/g, "_");
      blocks.push({
        type: "actions",
        block_id: `decision_buttons_${key}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Einverstanden" },
            style: "primary",
            action_id: "open_pin_modal",
            value: key,
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
    }

    return blocks;
  });
}
