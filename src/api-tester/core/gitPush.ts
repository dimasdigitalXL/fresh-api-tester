// src/api-tester/core/gitPush.ts

import { Octokit } from "https://esm.sh/@octokit/rest@19";
import type { GitRepoInfo } from "./configLoader.ts";
import type { Schema } from "./types.ts";
import { basename } from "https://deno.land/std@0.216.0/path/mod.ts";

export type RepoInfo = GitRepoInfo;

/** Beschreibt eine neu generierte Schema-Datei */
export interface SchemaUpdate {
  key: string;
  fsPath: string; // z.B. "/.../src/api-tester/expected/Get_View_Customer_v1.json"
  newSchema: Schema; // der Inhalt, der gepusht werden soll
}

/** Base64-(De-)Codierung für UTF-8-Strings */
function decodeBase64(content: string): string {
  const cleaned = content.replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let bin = "";
  for (const b of utf8) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

/**
 * Pusht neue „expected“-Schemas ins GitHub-Repo und
 * passt config.json so an, dass expectedStructure auf die
 * neuen Dateinamen zeigt.
 */
export async function pushExpectedSchemaToGit(
  repoInfo: RepoInfo,
  schemaUpdates: SchemaUpdate[],
) {
  const octo = new Octokit({ auth: Deno.env.get("GITHUB_TOKEN") });

  // 1) Alle neuen/updated Schema-Dateien pushen
  const pushed: { key: string; pathInRepo: string }[] = [];
  for (const { key, fsPath, newSchema } of schemaUpdates) {
    const contentText = JSON.stringify(newSchema, null, 2) + "\n";
    const pathInRepo = fsPath.match(/src\/api-tester\/expected\/.+$/)?.[0];
    if (!pathInRepo) {
      console.warn(`⚠️ Kann Repo-Pfad nicht bestimmen für ${fsPath}`);
      continue;
    }

    // 1a) SHA holen, falls schon vorhanden
    let sha: string | undefined;
    try {
      const resp = await octo.repos.getContent({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        ref: repoInfo.branch,
      });
      if (!Array.isArray(resp.data) && resp.data.type === "file") {
        sha = resp.data.sha;
      }
    } catch {
      // existiert noch nicht
    }

    // 1b) Datei anlegen oder updaten
    try {
      const base64 = encodeBase64(contentText);
      await octo.repos.createOrUpdateFileContents({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        message: `chore: update expected schema ${key}`,
        content: base64,
        branch: repoInfo.branch,
        ...(sha ? { sha } : {}),
      });
      console.log(`✅ Gesetzt in Git: ${pathInRepo}`);
      pushed.push({ key, pathInRepo });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Git-Push fehlgeschlagen für ${pathInRepo}: ${msg}`);
    }
  }

  if (pushed.length === 0) {
    console.log(
      "ℹ️ Keine Schema-Updates gepusht, config.json bleibt unverändert.",
    );
    return;
  }

  // 2) config.json aus dem Repo holen
  const cfgPath = "config.json";
  let cfgSha: string;
  let configObj: {
    endpoints: Array<{ name: string; expectedStructure?: string }>;
  };

  try {
    const cfgResp = await octo.repos.getContent({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: cfgPath,
      ref: repoInfo.branch,
    });
    if (Array.isArray(cfgResp.data) || cfgResp.data.type !== "file") {
      throw new Error("config.json ist kein File");
    }
    cfgSha = cfgResp.data.sha;
    configObj = JSON.parse(decodeBase64(cfgResp.data.content));
  } catch (err) {
    // Bei 404: einfach überspringen
    const status = typeof err === "object" &&
        err !== null &&
        "status" in err
      ? (err as { status: number }).status
      : undefined;
    if (status === 404) {
      console.warn(
        `⚠️ config.json nicht gefunden unter '${cfgPath}'. Überspringe config.json-Update.`,
      );
      return;
    }
    console.error("❌ Unerwarteter Fehler beim Laden der config.json:", err);
    return;
  }

  // 3) In-Memory-Anpassung: expectedStructure auf neue Dateinamen setzen
  for (const { key, pathInRepo } of pushed) {
    const filename = basename(pathInRepo); // z.B. Get_View_Customer_v2.json
    const rel = `expected/${filename}`; // Pfad in config.json
    for (const ep of configObj.endpoints) {
      if (ep.name.replace(/\s+/g, "_") === key) {
        ep.expectedStructure = rel;
        console.log(
          `🔄 config.json: "${ep.name}" → expectedStructure="${rel}"`,
        );
      }
    }
  }

  // 4) config.json zurückcommitten
  try {
    const newConfigText = JSON.stringify(configObj, null, 2) + "\n";
    const newBase64 = encodeBase64(newConfigText);
    await octo.repos.createOrUpdateFileContents({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: cfgPath,
      message: "chore: update config.json with new expectedStructure",
      content: newBase64,
      branch: repoInfo.branch,
      sha: cfgSha,
    });
    console.log("✅ config.json aktualisiert");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Konnte config.json nicht zurückschreiben:", msg);
  }
}
