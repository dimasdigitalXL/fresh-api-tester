// src/api-tester/core/slack/slackReporter/renderIssueBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";

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
    const icon = issue.isCritical ? "🔴" : "🟠";

    const blocks: Block[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${
            index + 1
          }️⃣ ${issue.endpointName}* \`(${issue.method})\` ${icon}`,
        },
      },
    ];

    // Wenn das erwartete Schema fehlt
    if (issue.expectedMissing) {
      blocks.push({
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `❌ Erwartete Datei nicht gefunden: \`${issue.expectedFile}\``,
        }],
      });
    } else {
      if (missing.length) {
        blocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `❌ Fehlende Felder: ${missing.join(", ")}`,
          }],
        });
      }
      if (extra.length) {
        blocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `➕ Neue Felder: ${extra.join(", ")}`,
          }],
        });
      }
      if (types.length) {
        blocks.push({
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `⚠️ *Typabweichungen:*\n${types.join("\n")}`,
          }],
        });
      }
    }

    // Buttons für Approval / Warten
    if (
      issue.expectedMissing ||
      issue.isCritical ||
      missing.length ||
      extra.length ||
      types.length
    ) {
      const key = issue.endpointName.replace(/\s+/g, "_");
      blocks.push(
        { type: "divider" },
        {
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
        },
        { type: "divider" },
      );
    } else {
      blocks.push({ type: "divider" });
    }

    return blocks;
  });
}
