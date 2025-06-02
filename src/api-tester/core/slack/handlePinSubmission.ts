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

/**
 * Verarbeitet das Submission-Event aus dem PIN-Modal:
 * 1) PIN prüfen
 * 2) Approval in KV setzen
 * 3) Passende SchemaUpdate aus KV holen und in Git pushen
 * 4) rawBlocks aktualisieren: Buttons entfernen, „Freigegeben“-Sektion anhängen
 * 5) Tests neu starten
 */
export async function handlePinSubmission(
  payload: SlackSubmissionPayload,
): Promise<void> {
  console.log("🔔 handlePinSubmission aufgerufen:", JSON.stringify(payload));

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
    // Slack zeigt durch Response-Action im Modal automatisch „Falscher PIN“ an:
    return;
  }

  // 6) Approval-Status in KV setzen
  try {
    const { value: storedApprovals } = await kvInstance.get<
      Record<string, string>
    >(["approvals"]);
    const approvals = storedApprovals ?? {};
    approvals[key] = "approved";
    await kvInstance.set(["approvals"], approvals);
    console.log("✅ KV: approval status 'approved' für", key);
  } catch (e) {
    console.error("❌ Fehler beim Speichern der Approvals in KV:", e);
    return;
  }

  // 7) Passende SchemaUpdates aus KV laden
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
    // 9) Schema-Update in Git pushen
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
      console.log(`✅ SchemaUpdate für "${key}" in Git gepusht.`);
    } catch (e) {
      console.error("❌ Fehler beim Git-Push für", key, ":", e);
      // Fortsetzen, damit Slack-Update dennoch erfolgt.
    }

    // 10) pendingUpdates in KV bereinigen: Entferne den genehmigten Eintrag
    try {
      const newPending = pendingForAll.filter((upd) => upd.key !== key);
      await kvInstance.set(["pendingUpdates"], newPending);
      console.log(`✅ KV: pendingUpdates um "${key}" bereinigt.`);
    } catch (e) {
      console.error("❌ Fehler beim Bereinigen von pendingUpdates in KV:", e);
    }
  }

  // 11) Slack-Nachricht aktualisieren
  try {
    // a) Original-Blöcke aus KV holen
    const { value: storedBlocks } = await kvInstance.get<SlackBlock[]>([
      "rawBlocks",
      key,
    ]);
    const originalBlocks = Array.isArray(storedBlocks) ? storedBlocks : [];

    // b) Buttons entfernen
    const cleanedBlocks: SlackBlock[] = originalBlocks.filter(
      (b) => b.block_id !== `decision_buttons_${key}`,
    );

    // c) Letzten Divider entfernen, falls vorhanden
    if (
      cleanedBlocks.length > 0 &&
      cleanedBlocks[cleanedBlocks.length - 1].type === "divider"
    ) {
      cleanedBlocks.pop();
    }

    // d) Bestätigungs-Abschnitt anhängen
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString("de-DE");

    // Detail-Lines zusammenbauen
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
      detailLines.push("_Keine Abweichungen vorhanden_");
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

    // e) Chat-Update an Slack senden
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

    // f) Aktualisierte Blöcke in KV speichern
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
    console.log(`[api-tester] Neuer Durchlauf mit Exit-Code ${status.code}`);
  } catch (e) {
    console.error("❌ Fehler beim Neustarten der Tests:", e);
  }
}
