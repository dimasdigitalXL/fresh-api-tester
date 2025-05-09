// src/api-tester/core/slack/slackReporter/renderIssueBlocks.ts
import type { Block } from "./renderHeaderBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

// interne Hilfs-Typen
type Issue = Pick<
  TestResult,
  | "endpointName"
  | "method"
  | "missingFields"
  | "extraFields"
  | "typeMismatches"
  | "isCritical"
>;

export function renderIssueBlocks(issues: Issue[]): Block[] {
  return issues.flatMap((issue, index) => {
    const missing = issue.missingFields.map((m) =>
      m.replace(/^data(\[0\])?\./, "")
    );
    const extra = issue.extraFields.map((e) =>
      e.replace(/^data(\[0\])?\./, "")
    );
    const types = (issue.typeMismatches || []).map(
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

    // ⚙️ Buttons immer anhängen, sobald es irgendeine Abweichung gibt
    if (missing.length || extra.length || types.length) {
      const key = issue.endpointName.replace(/\s+/g, "_");
      blocks.push(
        {
          type: "divider",
        },
        {
          type: "actions",
          block_id: "decision_buttons",
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
        {
          type: "divider",
        },
      );
    } else {
      // Keine Abweichung → kein Block
      blocks.push({ type: "divider" });
    }

    return blocks;
  });
}
