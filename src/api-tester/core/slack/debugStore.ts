// src/api-tester/core/slack/debugStore.ts

/**
 * Einfache In-Memory-Liste für die letzten Slack-Events.
 * Zum Debuggen werden hier Typ, Timestamp und rohes Payload-Objekt abgelegt.
 */
export const slackDebugEvents: Array<{
  time: number;
  type: string;
  rawPayload: unknown;
}> = [];
