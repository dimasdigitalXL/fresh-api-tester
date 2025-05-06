// src/api-tester/core/slack/getDisplayName.ts

/**
 * Holt den Display-Namen eines Slack-Users.
 * @param userId – Slack User-ID (z.B. U123ABC)
 * @param token – Slack Bot Token
 * @returns Anzeigename oder, falls nicht verfügbar, die User-ID
 */
export async function getDisplayName(
  userId: string,
  token: string,
): Promise<string> {
  try {
    const url = new URL("https://slack.com/api/users.info");
    url.searchParams.set("user", userId);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      console.warn("⚠️ Slack API users.info returned", resp.status);
      return userId;
    }

    const data = (await resp.json()) as {
      ok: boolean;
      user?: {
        profile?: {
          display_name?: string;
          real_name?: string;
        };
      };
      error?: string;
    };

    if (data.ok && data.user?.profile) {
      const { display_name, real_name } = data.user.profile;
      return display_name || real_name || userId;
    } else {
      console.warn("⚠️ Slack API users.info error:", data.error);
    }
  } catch (e: unknown) {
    console.warn(
      "⚠️ Nutzername nicht abrufbar:",
      e instanceof Error ? e.message : String(e),
    );
  }

  return userId;
}
