// src/api-tester/core/slack/slackReporter/renderIssueBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

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
    // Liste mit gekürzten Pfaden
    const missing = issue.missingFields.map((m) =>
      m.replace(/^data(\[0\])?\./, "")
    );
    const extra = issue.extraFields.map((e) =>
      e.replace(/^data(\[0\])?\./, "")
    );
    const types = (issue.typeMismatches || []).map((m) => ({
      path: m.path.replace(/^data(\[0\])?\./, ""),
      expected: m.expected,
      actual: m.actual,
    }));
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
          text: "⚠️ *Typabweichungen:*\n" +
            types.map((t) =>
              `• ${t.path}: erwartet \`${t.expected}\`, erhalten \`${t.actual}\``
            ).join("\n"),
        }],
      });
    }

    // Buttons nur, wenn echte Abweichungen oder kritisch
    if (issue.isCritical || missing.length || extra.length || types.length) {
      const key = issue.endpointName.replace(/\s+/g, "_");
      // payload mit allen Details
      const payload = JSON.stringify({
        endpointName: issue.endpointName,
        method: issue.method,
        missing,
        extra,
        typeMismatches: types,
      });
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
              value: payload, // <-- hier kommt das JSON mit allen Diffs
            },
            {
              type: "button",
              text: { type: "plain_text", text: "⏸️ Warten" },
              style: "danger",
              action_id: "wait_action",
              value: payload, // <-- gleiches Payload
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
