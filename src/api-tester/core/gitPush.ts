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
  newSchema: Schema; // der komplette Response-Body
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
  for (const b of utf8) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Erzeugt aus einem „echten“ Schema eine Stub-Variante,
 * in der alle Strings durch "string", alle Numbers durch 0,
 * alle Booleans durch false und alle Null-Werte durch null ersetzt sind,
 * und bei Arrays nur das erste Element übernommen wird.
 */
function stubify(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    // nur das erste Element als Platzhalter-Array
    if (value.length > 0) {
      return [stubify(value[0])];
    }
    return [];
  }
  if (typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      o[k] = stubify(v);
    }
    return o;
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

/**
 * Pusht neue „expected“-Schemas ins GitHub-Repo und
 * passt src/api-tester/config.json so an, dass expectedStructure
 * auf die neuen Dateinamen zeigt.
 */
export async function pushExpectedSchemaToGit(
  repoInfo: RepoInfo,
  schemaUpdates: SchemaUpdate[],
) {
  const octo = new Octokit({ auth: Deno.env.get("GITHUB_TOKEN") });

  // 1) Alle neuen/updated Schema-Dateien pushen
  const pushed: { key: string; pathInRepo: string }[] = [];
  for (const { key, fsPath, newSchema } of schemaUpdates) {
    // erst die Stub-Variante erzeugen
    const stubSchema = stubify(newSchema);
    const contentText = JSON.stringify(stubSchema, null, 2) + "\n";

    const match = fsPath.match(/src\/api-tester\/expected\/.+$/);
    if (!match) {
      console.warn(`⚠️ Kann Repo-Pfad nicht bestimmen für ${fsPath}`);
      continue;
    }
    const pathInRepo = match[0];

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
      // Datei existiert noch nicht → neu anlegen
    }

    // 1b) Create or update
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

  // 2) config.json aus dem Repo holen (unter src/api-tester/)
  const cfgPath = "src/api-tester/config.json";
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
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
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
