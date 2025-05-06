// src/api-tester/core/slack/slackWorkspaces.ts

/**
 * Reads all configured Slack workspaces from environment variables.
 * Supports any number of:
 *   SLACK_BOT_TOKEN_1, SLACK_CHANNEL_ID_1, SLACK_SIGNING_SECRET_1
 *   SLACK_BOT_TOKEN_2, SLACK_CHANNEL_ID_2, SLACK_SIGNING_SECRET_2
 *   …
 */
export function getSlackWorkspaces(): Array<{
  token: string;
  channel: string;
  signingSecret: string;
}> {
  const workspaces = [];
  let i = 1;

  // Loop until we no longer find a full token+channel pair
  while (true) {
    const token = Deno.env.get(`SLACK_BOT_TOKEN_${i}`);
    const channel = Deno.env.get(`SLACK_CHANNEL_ID_${i}`);
    if (!token || !channel) break;

    workspaces.push({
      token,
      channel,
      signingSecret: Deno.env.get(`SLACK_SIGNING_SECRET_${i}`) ?? "",
    });
    i++;
  }

  return workspaces;
}
