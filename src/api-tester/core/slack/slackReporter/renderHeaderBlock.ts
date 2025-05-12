// src/api-tester/core/slack/slackReporter/renderHeaderBlock.ts
export type Block = Record<string, unknown>;

export function renderHeaderBlock(dateStr?: string): Block[] {
  const formattedDate = dateStr || new Date().toLocaleDateString("de-DE");
  // Hier holen wir uns die Deployment-ID (falls gesetzt) sonst "local"
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🔍 API Testbericht" },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `📅 Datum: *${formattedDate}*` },
      ],
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `_Deployment: ${deploymentId}_` },
      ],
    },
    { type: "divider" },
  ];
}
