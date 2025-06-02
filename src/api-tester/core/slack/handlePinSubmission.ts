// src/api-tester/core/slack/handlePinSubmission.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../kv.ts";
import { getSlackWorkspaces } from "./slackWorkspaces.ts";
import { getDisplayName } from "./getDisplayName.ts";
import {
  pushExpectedSchemaToGit,
  type RepoInfo,
  type SchemaUpdate,
} from "../gitPush.ts";

export interface SlackSubmissionPayload {
  view: {
    state: {
      values: {
        pin_input: { pin: { value: string } };
      };
    };
    private_metadata: string;
    callback_id: string;
  };
  user: { id: string };
}

interface ParsedMetadata {
  endpoint: string;
  missing: string[];
  extra: string[];
  typeMismatches: Array<{ path: string; expected: string; actual: string }>;
  original_ts: string;
  channel: string;
}

interface SlackBlock {
  block_id?: string;
  type: string;
  [key: string]: unknown;
}

export async function handlePinSubmission(
  payload: SlackSubmissionPayload,
): Promise<void> {
  console.log("🔔 handlePinSubmission aufgerufen");

  // 1) PIN auslesen
  const pin = payload.view.state.values.pin_input.pin.value;

  // 2) private_metadata parsen
  let meta: ParsedMetadata;
  try {
    meta = JSON.parse(payload.view.private_metadata);
  } catch {
    console.error("❌ Konnte private_metadata nicht parsen");
    return;
  }
  const {
    endpoint,
    missing: missingArr,
    extra: extraArr,
    typeMismatches: tmArr,
    original_ts: originalTs,
    channel,
  } = meta;
  const key = endpoint.replace(/\s+/g, "_");

  // 3) Workspace & Token ermitteln
  const ws = getSlackWorkspaces().find((w) => w.channel === channel);
  if (!ws) {
    console.error("🚨 Kein Workspace gefunden für Channel:", channel);
    return;
  }
  const token = ws.token;

  // 4) DisplayName holen
  let userName: string;
  try {
    userName = await getDisplayName(payload.user.id, token);
  } catch (e) {
    console.error("❌ Fehler bei getDisplayName:", e);
    userName = `<@${payload.user.id}>`;
  }

  // 5) PIN prüfen
  const GLOBAL_PIN = Deno.env.get("SLACK_APPROVE_PIN") ?? "1234";
  if (pin !== GLOBAL_PIN) {
    console.warn("❌ Falsche PIN für", endpoint);
    // Slack zeigt automatisch „Falscher PIN“ im Modal an:
    return;
  }

  // 6) Approval-Status in KV setzen
  try {
    const { value: storedApprovals } = await kvInstance.get<
      Record<string, string>
    >(
      ["approvals"],
    );
    const approvals = storedApprovals ?? {};
    approvals[key] = "approved";
    await kvInstance.set(["approvals"], approvals);
    console.log("✅ KV: approval status 'approved' für", key);
  } catch (e) {
    console.error("❌ Fehler beim Speichern der Approvals in KV:", e);
    return;
  }

  // 7) Aus KV: pendingUpdates laden
  let pendingForAll: SchemaUpdate[] = [];
  try {
    const { value: pendingValue } = await kvInstance.get<SchemaUpdate[]>([
      "pendingUpdates",
    ]);
    pendingForAll = Array.isArray(pendingValue) ? pendingValue : [];
  } catch (e) {
    console.error("❌ Fehler beim Laden von pendingUpdates aus KV:", e);
    pendingForAll = [];
  }

  // 8) Finde das passende SchemaUpdate fürs aktuelle key
  const matching = pendingForAll.find((upd) => upd.key === key);
  if (!matching) {
    console.warn(
      `⚠️ Kein Pending-Update gefunden für ${key}. Nichts zu committen.`,
    );
  } else {
    // 9) Schema-Update in Git pushen (mit GITHUB_OWNER / GITHUB_REPO)
    try {
      const owner = Deno.env.get("GITHUB_OWNER");
      const repo = Deno.env.get("GITHUB_REPO");
      const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";
      if (!owner || !repo) {
        throw new Error(
          "GITHUB_OWNER und GITHUB_REPO müssen in der Umgebung gesetzt sein.",
        );
      }
      const repoInfo: RepoInfo = { owner, repo, branch };
      await pushExpectedSchemaToGit(repoInfo, [matching]);
      console.log(`✅ Schema für "${key}" in Git gepusht.`);
    } catch (e) {
      console.error("❌ Fehler beim Git-Push für", key, ":", e);
      // Weiterführen, damit Slack-Nachricht dennoch aktualisiert wird.
    }

    // 10) pendingUpdates in KV aktualisieren: Entferne den genehmigten Eintrag
    try {
      const newPending = pendingForAll.filter((upd) => upd.key !== key);
      await kvInstance.set(["pendingUpdates"], newPending);
      console.log(`✅ KV: pendingUpdates um "${key}" bereinigt.`);
    } catch (e) {
      console.error("❌ Fehler beim Bereinigen von pendingUpdates in KV:", e);
    }
  }

  // 11) Slack-Nachricht updaten (Buttons entfernen, Drift-Text beibehalten)
  try {
    // a) Original-Blöcke aus KV holen
    const { value: storedBlocks } = await kvInstance.get<SlackBlock[]>([
      "rawBlocks",
      key,
    ]);
    const originalBlocks = Array.isArray(storedBlocks) ? storedBlocks : [];

    // b) Decision-Buttons entfernen (block_id = "decision_buttons_<key>")
    const cleanedBlocks: SlackBlock[] = [];
    for (const b of originalBlocks) {
      if (b.block_id === `decision_buttons_${key}`) {
        continue;
      }
      cleanedBlocks.push(b);
    }

    // c) Bestätigungs-Abschnitt (Detail-Info + Zeitstempel + Freigegeben-Block)
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString("de-DE");

    // Detail-Lines zusammenstellen
    const detailLines: string[] = [];
    if (missingArr.length > 0) {
      detailLines.push(`*❌ Fehlende Felder:* ${missingArr.join(", ")}`);
    }
    if (extraArr.length > 0) {
      detailLines.push(`*➕ Neue Felder:* ${extraArr.join(", ")}`);
    }
    if (tmArr.length > 0) {
      const tmLines = tmArr.map(
        (m) =>
          `• \`${m.path}\`: erwartet \`${m.expected}\`, erhalten \`${m.actual}\``,
      );
      detailLines.push(`*⚠️ Typabweichungen:*\n${tmLines.join("\n")}`);
    }
    if (detailLines.length === 0) {
      detailLines.push("_Keine Detail-Infos verfügbar_");
    }

    const confirmationBlocks: SlackBlock[] = [
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*AKTUALISIERT* • ${timeFormatted}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: detailLines.join("\n"),
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Freigegeben durch ${userName}*`,
        },
      },
    ];

    const updatedBlocks = [...cleanedBlocks, ...confirmationBlocks];

    // d) Chat-Update ausführen
    const resp = await axios.post(
      "https://slack.com/api/chat.update",
      {
        channel,
        ts: originalTs,
        text: `✅ ${userName} hat *${endpoint}* freigegeben.`,
        blocks: updatedBlocks,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("▶️ Slack API chat.update response:", resp.data);

    // e) aktualisierte Blöcke wieder in KV speichern
    await kvInstance.set(["rawBlocks", key], updatedBlocks);
    console.log("✅ KV: rawBlocks updated für", key);
  } catch (e) {
    console.error("❌ Fehler beim Slack-Update:", e);
  }

  // 12) Tests neu starten
  try {
    console.log("▶️ Starte neuen Testlauf nach Approval…");
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--unstable", "--unstable-kv", "-A", "run-tests.ts"],
      cwd: Deno.cwd(),
      env: { ...Deno.env.toObject(), SKIP_KV: "false" },
    });
    const child = cmd.spawn();
    const status = await child.status;
    console.log(`[api-tester] erneuter Durchlauf mit Exit-Code ${status.code}`);
  } catch (e) {
    console.error("❌ Fehler beim Neustarten der Tests:", e);
  }
}
