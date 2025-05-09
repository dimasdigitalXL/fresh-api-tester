// src/api-tester/core/slack/debugStore.ts

/** Einfache In-Memory-Liste für die letzten Slack-Events */
export const slackDebugEvents: Array<{
  time: number;
  type: string;
  rawPayload: unknown;
}> = [];
