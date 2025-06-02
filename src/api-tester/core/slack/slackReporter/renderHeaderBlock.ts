// src/api-tester/core/slack/slackReporter/renderHeaderBlock.ts

export type Block = Record<string, unknown>;

/**
 * Rendert den Header des API-Testberichts.
 *
 * @param dateStr Optionales Datum im Format "DD.MM.YYYY".
 *                Wenn nicht gesetzt, wird das heutige Datum ("de-DE") verwendet.
 * @returns Array von Slack-Blocks für das Header-Segment.
 */
export function renderHeaderBlock(dateStr?: string): Block[] {
  const formattedDate = dateStr ?? new Date().toLocaleDateString("de-DE");
  // Deployment-ID abrufen (in Deno Deploy gesetzt), ansonsten "local"
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🔍 API Testbericht",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📅 Datum: *${formattedDate}*`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_Deployment: ${deploymentId}_`,
        },
      ],
    },
    { type: "divider" },
  ];
}
