// src/api-tester/core/slack/slackReporter/renderHeaderBlock.ts
export type Block = Record<string, unknown>;

export function renderHeaderBlock(dateStr?: string): Block[] {
  const formattedDate = dateStr || new Date().toLocaleDateString("de-DE");
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🔍 API Testbericht" },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `📅 Datum: *${formattedDate}*` }],
    },
    { type: "divider" },
  ];
}
