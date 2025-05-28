// src/api-tester/core/slack/slackReporter/renderVersionBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";
import type { VersionUpdate } from "../../endpointRunner.ts";

/**
 * Rendert einen Abschnitt für jede erkannte neue API-Version.
 */
export function renderVersionBlocks(
  versionUpdates: VersionUpdate[],
): Block[] {
  if (versionUpdates.length === 0) {
    return [];
  }

  const header: Block = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "🚀 *Automatisch erkannte neue API-Versionen:*",
    },
  };

  const sections: Block[] = versionUpdates.map((update) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🔄 *${update.name}*\n🔗 <${update.url}>`,
    },
  }));

  const divider: Block = { type: "divider" };

  return [header, ...sections, divider];
}
