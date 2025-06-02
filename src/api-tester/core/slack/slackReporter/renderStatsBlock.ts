// src/api-tester/core/slack/slackReporter/renderStatsBlock.ts

import type { Block } from "./renderHeaderBlock.ts";

/**
 * Generiert die Block Kit-Sektion für die Gesamtstatistik.
 *
 * @param total    – Gesamtanzahl der API-Calls
 * @param success  – Anzahl erfolgreicher Calls
 * @param warnings – Anzahl mit Warnungen (fehlende/zusätzliche Felder)
 * @param critical – Anzahl kritischer Fehler (Typabweichungen)
 * @returns Ein Array von Slack Block Kit-Blöcken für die Statistik
 */
export function renderStatsBlock(
  total: number,
  success: number,
  warnings: number,
  critical: number,
): Block[] {
  // Status-Emoji: Rot, wenn kritische Fehler > 0; Orange, wenn Warnungen > 0; sonst Grün
  const statusEmoji = critical > 0 ? "🔴" : warnings > 0 ? "🟠" : "🟢";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📊 *Gesamtstatistik:* ${total} API-Calls`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔹 🟢 *Erfolgreich:* ${success}\n` +
          `🔹 🟠 *Achtung:* ${warnings}\n` +
          `🔹 🔴 *Kritisch:* ${critical}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📢 *Status:* ${statusEmoji}`,
      },
    },
    {
      type: "divider",
    },
  ];
}
