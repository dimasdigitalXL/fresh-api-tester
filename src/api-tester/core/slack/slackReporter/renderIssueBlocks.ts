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
    // 1) Felder bereinigen
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
    const key = issue.endpointName.replace(/\s+/g, "_");

    // 2) Payload mit allen Diff-Daten serialisieren
    const actionValue = JSON.stringify({ key, missing, extra, types });

    // 3) Section-Block für die Überschrift
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

    // 4) Kontext-Blöcke für fehlende Felder, neue Felder und Typ-Abweichungen
    if (missing.length) {
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
    if (extra.length) {
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
    if (types.length) {
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

    // 5) Buttons nur anzeigen, wenn Abweichungen oder kritischer Test vorliegen
    if (issue.isCritical || missing.length || extra.length || types.length) {
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
              value: actionValue, // Enthält key + Diff-Daten
            },
            {
              type: "button",
              text: { type: "plain_text", text: "⏸️ Warten" },
              style: "danger",
              action_id: "wait_action",
              value: key, // Nur der Endpoint-Key
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
