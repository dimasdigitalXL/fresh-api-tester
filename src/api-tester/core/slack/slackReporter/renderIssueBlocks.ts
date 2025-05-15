// src/api-tester/core/slack/slackReporter/renderIssueBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

// wir picken hier nur die Felder, die wir wirklich brauchen
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
    const key = issue.endpointName.replace(/\s+/g, "_");

    // Aufbereiten der Texte
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

    const blocks: Block[] = [];

    // 1️⃣ Header-Section
    blocks.push({
      type: "section",
      block_id: `header_${key}`,
      text: {
        type: "mrkdwn",
        text: `*${
          index + 1
        }️⃣ ${issue.endpointName}* \`(${issue.method})\` ${icon}`,
      },
    });

    // 2️⃣ Context-Blöcke für Fehlerdetails
    if (missing.length) {
      blocks.push({
        type: "context",
        block_id: `missing_${key}`,
        elements: [
          {
            type: "mrkdwn",
            text: `❌ Fehlende Felder: ${missing.join(", ")}`,
          },
        ],
      });
    }

    if (extra.length) {
      blocks.push({
        type: "context",
        block_id: `extra_${key}`,
        elements: [
          {
            type: "mrkdwn",
            text: `➕ Neue Felder: ${extra.join(", ")}`,
          },
        ],
      });
    }

    if (types.length) {
      blocks.push({
        type: "context",
        block_id: `types_${key}`,
        elements: [
          {
            type: "mrkdwn",
            text: `⚠️ *Typabweichungen:*\n${types.join("\n")}`,
          },
        ],
      });
    }

    // 3️⃣ Buttons-Block (nur wenn Abweichungen existieren)
    if (missing.length || extra.length || types.length) {
      // oberer Divider
      blocks.push({
        type: "divider",
        block_id: `divider_top_${key}`,
      });

      // Actions mit dynamischer block_id
      blocks.push({
        type: "actions",
        block_id: `decision_buttons_${key}`,
        elements: [
          {
            type: "button",
            action_id: "open_pin_modal",
            text: { type: "plain_text", text: "✅ Einverstanden", emoji: true },
            style: "primary",
            value: key,
          },
          {
            type: "button",
            action_id: "wait_action",
            text: { type: "plain_text", text: "⏸️ Warten", emoji: true },
            style: "danger",
            value: key,
          },
        ],
      });

      // unterer Divider
      blocks.push({
        type: "divider",
        block_id: `divider_bottom_${key}`,
      });
    } else {
      // wenn gar keine Abweichung, nur ein Divider für sauberen Abschluss
      blocks.push({
        type: "divider",
        block_id: `divider_${key}`,
      });
    }

    return blocks;
  });
}
