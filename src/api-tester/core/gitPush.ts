// src/api-tester/core/gitPush.ts

import { Octokit } from "https://esm.sh/@octokit/rest@19";
import type { GitRepoInfo } from "./configLoader.ts";
import type { Schema } from "./types.ts";
import { basename } from "https://deno.land/std@0.216.0/path/mod.ts";

export type RepoInfo = GitRepoInfo;

export interface SchemaUpdate {
  key: string;
  fsPath: string; // z.B. "/.../src/api-tester/expected/Get_View_Customer_v1.json"
  newSchema: Schema;
}

/** Decodes a base64-string (with possible linebreaks) into UTF-8 text */
function decodeBase64(content: string): string {
  const cleaned = content.replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encodes UTF-8 text into base64 */
function encodeBase64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let binary = "";
  for (const b of utf8) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Pusht neue/aktualisierte expected-Schemas ins GitHub-Repo
 * und aktualisiert die config.json so, dass expectedStructure
 * auf die neuen Dateinamen zeigt.
 */
export async function pushExpectedSchemaToGit(
  repoInfo: RepoInfo,
  schemaUpdates: SchemaUpdate[],
) {
  const octo = new Octokit({ auth: Deno.env.get("GITHUB_TOKEN") });
  const pushed: { key: string; pathInRepo: string }[] = [];

  // ─── 1) Schema-Dateien anlegen oder updaten ─────────────────────
  for (const { key, fsPath, newSchema } of schemaUpdates) {
    const contentText = JSON.stringify(newSchema, null, 2) + "\n";
    const pathInRepo = fsPath.match(/src\/api-tester\/expected\/.+$/)?.[0];
    if (!pathInRepo) {
      console.warn(`⚠️ Repo-Pfad nicht ermittelbar für ${fsPath}`);
      continue;
    }

    // 1a) ggf. SHA holen, falls schon vorhanden
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
      // Datei existiert nicht → wird neu erstellt
    }

    // 1b) Create or Update
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

  // ─── 2) config.json aus Repo laden ────────────────────────────
  const cfgPath = "config.json";
  let cfgSha: string;
  let configObj: {
    endpoints: Array<{ name: string; expectedStructure?: string }>;
  };

  try {
    const resp = await octo.repos.getContent({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: cfgPath,
      ref: repoInfo.branch,
    });
    if (Array.isArray(resp.data) || resp.data.type !== "file") {
      throw new Error("config.json ist kein File");
    }
    cfgSha = resp.data.sha;
    configObj = JSON.parse(decodeBase64(resp.data.content));
  } catch (err: unknown) {
    console.error("❌ Konnte config.json nicht laden:", err);
    return;
  }

  // ─── 3) In-Memory config.json updaten ────────────────────────
  for (const { key, pathInRepo } of pushed) {
    const filename = basename(pathInRepo); // z.B. Get_View_Customer_v2.json
    const rel = `expected/${filename}`;
    for (const ep of configObj.endpoints) {
      if (ep.name.replace(/\s+/g, "_") === key) {
        ep.expectedStructure = rel;
        console.log(
          `🔄 config.json: "${ep.name}" → expectedStructure="${rel}"`,
        );
      }
    }
  }

  // ─── 4) config.json zurückcommitten ─────────────────────────
  try {
    const newText = JSON.stringify(configObj, null, 2) + "\n";
    const newB64 = encodeBase64(newText);
    await octo.repos.createOrUpdateFileContents({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: cfgPath,
      message: "chore: update config.json with new expectedStructure",
      content: newB64,
      branch: repoInfo.branch,
      sha: cfgSha,
    });
    console.log("✅ config.json aktualisiert");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Konnte config.json nicht zurückschreiben:", msg);
  }
}
