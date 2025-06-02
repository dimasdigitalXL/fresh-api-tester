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
  newSchema: Schema; // vollständiges Response-Body-Schema
}

/** Base64-Decodierung für UTF-8-codierte Strings */
function decodeBase64(content: string): string {
  const cleaned = content.replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Base64-Encoding für UTF-8-Strings */
function encodeBase64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let bin = "";
  for (const b of utf8) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

/**
 * Wandelt ein „echtes“ Schema in eine Stub-Variante um:
 * - Alle Strings → "string"
 * - Alle Numbers → 0
 * - Alle Booleans → false
 * - Null bleibt null
 * - Arrays werden auf ihr erstes Element abgebildet (rekursiv)
 * - Objekte werden rekursiv verarbeitet
 */
function stubify(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? [stubify(value[0])] : [];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stubify(v);
    }
    return out;
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
 * Pusht neue oder geänderte „expected“-Schemas ins GitHub-Repo und passt
 * anschließend die src/api-tester/config.json so an, dass expectedStructure
 * auf die neuen Dateinamen zeigt.
 */
export async function pushExpectedSchemaToGit(
  repoInfo: RepoInfo,
  schemaUpdates: SchemaUpdate[],
) {
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN nicht gesetzt. Git-Push übersprungen.");
    return;
  }

  const octo = new Octokit({ auth: githubToken });
  const pushedEntries: Array<{ key: string; pathInRepo: string }> = [];

  // 1) Alle neuen/updated Schema-Dateien pushen
  for (const { key, fsPath, newSchema } of schemaUpdates) {
    // a) Stub-Schema erzeugen
    const stubSchema = stubify(newSchema);
    const contentText = JSON.stringify(stubSchema, null, 2) + "\n";

    // b) Pfad im Repo bestimmen (relativ zu "src/api-tester/expected/..."); notfalls warnen
    const match = fsPath.match(/src\/api-tester\/expected\/.+$/);
    if (!match) {
      console.warn(
        `⚠️ Kann Repo-Pfad nicht bestimmen für "${fsPath}". Überspringe.`,
      );
      continue;
    }
    const pathInRepo = match[0];

    // c) Aktuelle SHA holen, falls Datei bereits existiert (Update-Fall)
    let existingSha: string | undefined;
    try {
      const resp = await octo.repos.getContent({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        ref: repoInfo.branch,
      });
      if (!Array.isArray(resp.data) && resp.data.type === "file") {
        existingSha = resp.data.sha;
      }
    } catch {
      // Datei existiert nicht → wird neu angelegt
    }

    // d) Datei erstellen oder aktualisieren
    try {
      const base64Content = encodeBase64(contentText);
      await octo.repos.createOrUpdateFileContents({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: pathInRepo,
        message: `chore: update expected schema ${key}`,
        content: base64Content,
        branch: repoInfo.branch,
        ...(existingSha ? { sha: existingSha } : {}),
      });
      console.log(`✅ Schema "${pathInRepo}" in GitHub gepusht.`);
      pushedEntries.push({ key, pathInRepo });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Git-Push fehlgeschlagen für "${pathInRepo}": ${msg}`);
    }
  }

  // 2) Wenn keine Datei gepusht wurde, beenden
  if (pushedEntries.length === 0) {
    console.log(
      "ℹ️ Keine Schema-Updates gepusht, config.json bleibt unverändert.",
    );
    return;
  }

  // 3) config.json aus dem Repo holen (unter src/api-tester/)
  const configPathInRepo = "src/api-tester/config.json";
  let configSha: string;
  let configObj: {
    endpoints: Array<{ name: string; expectedStructure?: string }>;
  };

  try {
    const cfgResp = await octo.repos.getContent({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: configPathInRepo,
      ref: repoInfo.branch,
    });

    if (Array.isArray(cfgResp.data) || cfgResp.data.type !== "file") {
      throw new Error("config.json ist kein File");
    }
    configSha = cfgResp.data.sha;
    configObj = JSON.parse(decodeBase64(cfgResp.data.content));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      console.warn(
        `⚠️ config.json nicht gefunden unter "${configPathInRepo}". Überspringe config.json-Update.`,
      );
      return;
    }
    console.error("❌ Unerwarteter Fehler beim Laden der config.json:", err);
    return;
  }

  // 4) In-Memory-Anpassung: expectedStructure auf neue Dateinamen setzen
  for (const { key, pathInRepo } of pushedEntries) {
    const filename = basename(pathInRepo); // z.B. Get_View_Customer_v2.json
    const relativePath = `expected/${filename}`; // Neu in config.json
    let found = false;

    for (const ep of configObj.endpoints) {
      if (ep.name.replace(/\s+/g, "_") === key) {
        ep.expectedStructure = relativePath;
        console.log(
          `🔄 config.json: Endpoint "${ep.name}" → expectedStructure="${relativePath}"`,
        );
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn(
        `⚠️ In config.json wurde kein Endpoint mit key "${key}" gefunden; expectedStructure nicht gesetzt.`,
      );
    }
  }

  // 5) config.json zurückspielen
  try {
    const newConfigText = JSON.stringify(configObj, null, 2) + "\n";
    const newBase64 = encodeBase64(newConfigText);
    await octo.repos.createOrUpdateFileContents({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: configPathInRepo,
      message: "chore: update config.json with new expectedStructure",
      content: newBase64,
      branch: repoInfo.branch,
      sha: configSha,
    });
    console.log("✅ config.json erfolgreich aktualisiert.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Konnte config.json nicht zurückschreiben:", msg);
  }
}
