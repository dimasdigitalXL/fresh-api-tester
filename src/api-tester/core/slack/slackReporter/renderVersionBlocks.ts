// src/api-tester/core/slack/slackReporter/renderVersionBlocks.ts

import type { Block } from "./renderHeaderBlock.ts";
import type { VersionUpdate } from "../../endpointRunner.ts";

/**
 * Rendert einen Abschnitt für jede erkannte neue API-Version.
 * Bei mehreren Updates zeigt es eine Überschrift, dann pro Update einen Eintrag,
 * und schließt mit einem Divider ab.
 *
 * @param versionUpdates Liste von VersionUpdate-Objekten
 * @returns Array von Slack-Blocks für die Version-Informationen
 */
export function renderVersionBlocks(
  versionUpdates: VersionUpdate[],
): Block[] {
  if (versionUpdates.length === 0) {
    return [];
  }

  // Header mit kurzer Erläuterung
  const header: Block = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "🚀 *Automatisch erkannte neue API-Versionen:*",
    },
  };

  // Für jedes Update ein eigener Section-Block
  const sections: Block[] = versionUpdates.map((update) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🔄 *${update.name}*\n🔗 <${update.url}>`,
    },
  }));

  // Abschließender Divider, um optisch abzugrenzen
  const divider: Block = { type: "divider" };

  return [header, ...sections, divider];
}
