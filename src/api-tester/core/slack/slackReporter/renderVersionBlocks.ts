// src/api-tester/core/slack/slackReporter/renderVersionBlocks.ts
import type { Block } from "./renderHeaderBlock.ts";

export function renderVersionBlocks(
  versionUpdates: { name: string; url: string }[],
): Block[] {
  if (versionUpdates.length === 0) return [];
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🚀 *Automatisch erkannte neue API-Versionen:*",
      },
    },
    ...versionUpdates.flatMap((update) => [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔄 *${update.name}*\n🔗 <${update.url}>`,
        },
      },
    ]),
    { type: "divider" },
  ];
}
