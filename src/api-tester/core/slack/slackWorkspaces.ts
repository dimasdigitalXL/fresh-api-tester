// src/api-tester/core/slack/slackWorkspaces.ts

/**
 * Liest alle konfigurierten Slack-Workspaces aus den ENV-Variablen aus.
 * Unterstützt beliebig viele Tupel:
 *   SLACK_BOT_TOKEN_1, SLACK_CHANNEL_ID_1, SLACK_SIGNING_SECRET_1
 *   SLACK_BOT_TOKEN_2, SLACK_CHANNEL_ID_2, SLACK_SIGNING_SECRET_2
 *   …
 *
 * Gibt ein Array von Objekten zurück, die jeweils enthalten:
 *   - token: Slack-Bot-Token
 *   - channel: Slack-Channel-ID
 *   - signingSecret: Signing-Secret (kann leer sein, dann wird Validation ggf. übersprungen)
 */
export function getSlackWorkspaces(): Array<{
  token: string;
  channel: string;
  signingSecret: string;
}> {
  const workspaces: Array<{
    token: string;
    channel: string;
    signingSecret: string;
  }> = [];
  let i = 1;

  // Schleife, bis kein vollständiges Token+Channel-Paar mehr gefunden wird
  while (true) {
    const token = Deno.env.get(`SLACK_BOT_TOKEN_${i}`);
    const channel = Deno.env.get(`SLACK_CHANNEL_ID_${i}`);
    if (!token || !channel) break;

    const signingSecret = Deno.env.get(`SLACK_SIGNING_SECRET_${i}`) ?? "";
    if (!signingSecret) {
      console.warn(
        `⚠️ SLACK_SIGNING_SECRET_${i} fehlt – Signature-Validation für diesen Workspace wird ggf. fehlschlagen.`,
      );
    }

    workspaces.push({ token, channel, signingSecret });
    i++;
  }

  return workspaces;
}
