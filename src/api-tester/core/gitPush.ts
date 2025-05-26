// src/api-tester/core/gitPush.ts

import { Octokit } from "https://esm.sh/@octokit/rest@19";
import type { GitRepoInfo } from "./configLoader.ts";
import type { Schema } from "./types.ts";
import { basename } from "https://deno.land/std@0.216.0/path/mod.ts";

/** Repo-Info für Push */
export type RepoInfo = GitRepoInfo;

/** Beschreibt eine neu generierte Schema-Datei */
export interface SchemaUpdate {
  key: string;
  fsPath: string; // z.B. "/.../src/api-tester/expected/Get_View_Customer_v1.json"
  newSchema: Schema; // der Inhalt, der gepusht werden soll
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

  // --- 1) Erst alle Schema-Dateien pushen ---
  const pushed: { key: string; pathInRepo: string }[] = [];
  for (const upd of schemaUpdates) {
    const content = JSON.stringify(upd.newSchema, null, 2) + "\n";
    const pathInRepo = upd.fsPath.match(/src\/api-tester\/expected\/.+$/)?.[0];
    if (!pathInRepo) {
      console.warn(`⚠️ Kann Repo-Pfad nicht bestimmen für ${upd.fsPath}`);
      continue;
    }

    // 1a) SHA ermitteln, falls schon vorhanden
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
      const base64 = btoa(unescape(encodeURIComponent(content)));
      await octo.repos.createOrUpdateFileContents({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        message: `chore: update expected schema ${upd.key}`,
        content: base64,
        branch: repoInfo.branch,
        ...(sha ? { sha } : {}),
      });
      console.log(`✅ Gesetzt in Git: ${pathInRepo}`);
      pushed.push({ key: upd.key, pathInRepo });
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

  // --- 2) config.json aus dem Repo holen ---
  const cfgPath = "config.json";
  const cfgResp = await octo.repos.getContent({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    path: cfgPath,
    ref: repoInfo.branch,
  });
  if (Array.isArray(cfgResp.data) || cfgResp.data.type !== "file") {
    console.warn("⚠️ Konnte config.json nicht laden.");
    return;
  }
  const fileData = cfgResp.data;
  const cfgSha = fileData.sha;
  // content ist Base64
  const encoded = fileData.content.replace(/\s/g, "");
  const decoded = decodeURIComponent(
    Array.prototype.map
      .call(
        atob(encoded),
        (c: string) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
      )
      .join(""),
  );
  const config = JSON.parse(decoded) as {
    endpoints: { name: string; expectedStructure?: string }[];
  };

  // --- 3) config.json in-memory anpassen ---
  for (const { key, pathInRepo } of pushed) {
    const filename = basename(pathInRepo); // z.B. Get_View_Customer_v1.json
    const rel = `expected/${filename}`; // neuer Pfad
    for (const ep of config.endpoints) {
      if (ep.name.replace(/\s+/g, "_") === key) {
        ep.expectedStructure = rel;
        console.log(
          `🔄 config.json: "${ep.name}" → expectedStructure="${rel}"`,
        );
      }
    }
  }

  // --- 4) config.json zurückschreiben ---
  const newCfgText = JSON.stringify(config, null, 2) + "\n";
  const newBase64 = btoa(unescape(encodeURIComponent(newCfgText)));
  await octo.repos.createOrUpdateFileContents({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    path: cfgPath,
    message: `chore: update config.json with new expectedStructure`,
    content: newBase64,
    branch: repoInfo.branch,
    sha: cfgSha,
  });
  console.log("✅ config.json aktualisiert");
}
