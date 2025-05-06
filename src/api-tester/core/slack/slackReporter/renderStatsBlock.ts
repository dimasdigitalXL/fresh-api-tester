// src/api-tester/core/slack/slackReporter/renderStatsBlock.ts

/**
 * Generiert die Block Kit-Sektion für die Gesamtstatistik.
 * @param total – Gesamtanzahl der API-Calls
 * @param success – Anzahl erfolgreicher Calls
 * @param warnings – Anzahl mit Warnungen (zusätzliche oder fehlende Felder)
 * @param critical – Anzahl kritischer Fehler
 * @returns Ein Array von Slack Block Kit-Blöcken
 */
export function renderStatsBlock(
  total: number,
  success: number,
  warnings: number,
  critical: number,
): unknown[] {
  const statusEmoji = critical > 0 ? "🔴" : warnings > 0 ? "🟠" : "🟢";

  return [
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `📊 *Gesamtstatistik:* ${total} API-Calls`,
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `🔹 🟢 *Erfolgreich:* ${success}\n` +
          `🔹 🟠 *Achtung:* ${warnings}\n` +
          `🔹 🔴 *Kritisch:* ${critical}`,
      },
    },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: `📢 *Status:* ${statusEmoji}`,
      },
    },
    {
      type: "divider" as const,
    },
  ];
}
