// src/api-tester/core/gitPush.ts

import { Octokit } from "https://esm.sh/@octokit/rest@19";
import type { GitRepoInfo } from "./configLoader.ts";
import type { Schema } from "./types.ts";

/** Repo-Info für Push */
export type RepoInfo = GitRepoInfo;

/** Schema-Update mit Pfad und Inhalt */
export interface SchemaUpdate {
  key: string;
  fsPath: string;
  newSchema: Schema;
}

/**
 * Pusht alle neuen expected-Schemas per GitHub API in den Repository-Branch.
 */
export async function pushExpectedSchemaToGit(
  repoInfo: RepoInfo,
  schemaUpdates: SchemaUpdate[],
) {
  const octo = new Octokit({ auth: Deno.env.get("GITHUB_TOKEN") });

  for (const upd of schemaUpdates) {
    const filePath = upd.fsPath;
    const content = JSON.stringify(upd.newSchema, null, 2) + "\n";
    const pathInRepo = filePath.match(/src\/api-tester\/expected\/.+$/)?.[0];
    if (!pathInRepo) {
      console.warn(`⚠️ Kann Pfad nicht bestimmen für ${filePath}`);
      continue;
    }

    // 1) file SHA holen (falls existiert)
    let sha: string | undefined;
    try {
      const resp = await octo.repos.getContent({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        ref: repoInfo.branch,
      });
      if (Array.isArray(resp.data)) {
        // war ein Verzeichnis – sollte nicht passieren
      } else if ("sha" in resp.data && typeof resp.data.sha === "string") {
        sha = resp.data.sha;
      }
    } catch {
      // Datei existiert noch nicht → wir erstellen später neu
    }

    // 2) committen (create oder update)
    try {
      await octo.repos.createOrUpdateFileContents({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        message: `chore: update expected schema ${upd.key}`,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: repoInfo.branch,
        // sha nur mitschicken, wenn vorhanden
        ...(sha ? { sha } : {}),
      });
      console.log(`✅ Gesetzt in Git: ${pathInRepo}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Git-Push fehlgeschlagen für ${pathInRepo}: ${msg}`);
      // Weiter zu nächsten Schema, ohne den ganzen Lauf zu beenden
    }
  }
}
