// routes/api/actions.ts

import { HandlerContext } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";
import { getSlackWorkspaces } from "../../src/api-tester/core/slack/slackWorkspaces.ts";
import { runAllTests } from "../../run-tests.ts";

/** Simplified Slack payload */
interface SlackActionPayload {
  type: string;
  actions?: Array<{ action_id: string; value: string }>;
  trigger_id?: string;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state: {
      values: {
        [blockId: string]: {
          [actionId: string]: { value: string };
        };
      };
    };
  };
  user: { id: string };
}

/** Verifies Slack signature */
async function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  slackSig: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const msgData = encoder.encode(`v0:${timestamp}:${rawBody}`);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}` === slackSig;
}

export const handler = async (
  req: Request,
  _ctx: HandlerContext,
): Promise<Response> => {
  const timestamp = req.headers.get("X-Slack-Request-Timestamp") ?? "";
  const slackSig = req.headers.get("X-Slack-Signature") ?? "";
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const payload = JSON.parse(
    params.get("payload") || "{}",
  ) as SlackActionPayload;

  // find workspace by signing secret
  const workspaces = getSlackWorkspaces();
  const ws = await Promise.any(
    workspaces.map(async (w) => {
      if (
        await verifySlackRequest(w.signingSecret, timestamp, rawBody, slackSig)
      ) {
        return w;
      }
      throw new Error("no match");
    }),
  ).catch(() => null);

  if (!ws) {
    console.warn("⚠️ Invalid Slack signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const callSlack = (path: string, body: unknown) =>
    fetch(`https://slack.com/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ws.token}`,
      },
      body: JSON.stringify(body),
    });

  const action = payload.actions?.[0];

  // 1) Open PIN modal
  if (action?.action_id === "open_pin_modal" && payload.trigger_id) {
    await callSlack("views.open", {
      trigger_id: payload.trigger_id,
      view: {
        type: "modal",
        callback_id: "submit_pin",
        private_metadata: action.value,
        title: { type: "plain_text", text: "PIN bestätigen" },
        blocks: [
          {
            type: "input",
            block_id: "pin_input",
            label: {
              type: "plain_text",
              text: "Gib deinen 4-stelligen PIN ein",
            },
            element: {
              type: "plain_text_input",
              action_id: "pin_value",
              placeholder: { type: "plain_text", text: "••••" },
            },
          },
        ],
        submit: { type: "plain_text", text: "Bestätigen" },
      },
    });
    return new Response(null, { status: 200 });
  }

  // 2) "Warten"
  if (action?.action_id === "wait_action") {
    const key = action.value!;
    const { value: approvalsValue } = await kvInstance.get<
      Record<string, string>
    >(["approvals"]);
    const approvals = approvalsValue ?? {};
    approvals[key] = "waiting";
    await kvInstance.set(["approvals"], approvals);
    return new Response(null, { status: 200 });
  }

  // 3) PIN-Submission
  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "submit_pin"
  ) {
    const key = payload.view.private_metadata!;
    const pin = payload.view.state.values.pin_input.pin_value.value;
    const expectedPin = Deno.env.get("SLACK_APPROVE_PIN") ?? "";

    if (pin === expectedPin) {
      // a) Approval setzen
      const { value: approvalsValue } = await kvInstance.get<
        Record<string, string>
      >(["approvals"]);
      const approvals = approvalsValue ?? {};
      approvals[key] = "approved";
      await kvInstance.set(["approvals"], approvals);

      // b) Ephemeral feedback
      await callSlack("chat.postEphemeral", {
        channel: key,
        user: payload.user.id,
        text: `✅ Freigabe für \`${key}\` erfolgreich.`,
      });

      // c) Pending-Schema löschen
      await kvInstance.delete(["schema-update-pending", key]);
      // d) rawBlocks löschen (falls noch da)
      await kvInstance.delete(["rawBlocks", key]);

      // e) Tests direkt im Prozess starten
      runAllTests().catch((err) =>
        console.error("❌ Fehler beim Ausführen der Tests:", err)
      );

      return new Response(null, { status: 200 });
    }

    // PIN falsch → Error im Modal
    return new Response(
      JSON.stringify({
        response_action: "errors",
        errors: { pin_input: "Falscher PIN" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Default
  return new Response(null, { status: 200 });
};
