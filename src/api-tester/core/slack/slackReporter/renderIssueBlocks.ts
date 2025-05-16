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

/**
 * Rendert für jede Abweichung mehrere Slack-Blöcke:
 *  - Überschrift mit Endpoint, Methode und Status-Icon
 *  - Context-Blöcke für fehlende, neue und Typ-Abweichungen
 *  - Action-Buttons, wobei der "Einverstanden"-Button
 *    die Details als JSON in seinem value mitgibt.
 */
export function renderIssueBlocks(issues: Issue[]): Block[] {
  return issues.flatMap((issue, index) => {
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
    // Icon: rot bei kritisch, orange bei Warnungen
    const icon = issue.isCritical ? "🔴" : "🟠";

    // Key für action_id / block_id
    const key = issue.endpointName.replace(/\s+/g, "_");

    // Header-Section
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

    // Context-Blöcke für Details
    if (missing.length) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `❌ *Fehlende Felder:* ${missing.join(", ")}`,
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
            text: `➕ *Neue Felder:* ${extra.join(", ")}`,
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
            text: `⚠️ *Typ-Abweichungen:*\n${types.join("\n")}`,
          },
        ],
      });
    }

    // Divider vor den Buttons oder als Abschluss
    blocks.push({ type: "divider" });

    // Buttons nur bei tatsächlichen Abweichungen oder kritischen Tests
    if (issue.isCritical || missing.length || extra.length || types.length) {
      // Diff-Objekt serialisieren für das Modal
      const diffPayload = JSON.stringify({
        endpoint: issue.endpointName,
        missing,
        extra,
        types,
        isCritical: issue.isCritical,
      });

      blocks.push({
        type: "actions",
        block_id: `decision_buttons_${key}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Einverstanden" },
            style: "primary",
            action_id: "open_pin_modal",
            value: diffPayload,
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
