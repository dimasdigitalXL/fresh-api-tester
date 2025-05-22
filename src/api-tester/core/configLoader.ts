// src/api-tester/core/configLoader.ts

import { resolveProjectPath } from "./utils.ts";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EndpointConfig {
  name: string;
  url: string;
  method: Method;
  requiresId?: boolean;
  expectedStructure?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  bodyFile?: string;
}

/** Git-Repo-Info für den Push der neuen Schemas */
export interface GitRepoInfo {
  owner: string;
  repo: string;
  /** optional, default: "main" */
  branch: string;
}

export interface Config {
  endpoints: EndpointConfig[];
  gitRepo: GitRepoInfo;
}

export async function loadConfig(): Promise<Config> {
  // 1) Endpoints aus config.json laden
  const pathToConfig = resolveProjectPath("config.json");
  let raw: string;
  try {
    raw = await Deno.readTextFile(pathToConfig);
  } catch (err) {
    console.error("❌ Fehler beim Laden der config.json:", err);
    Deno.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Ungültiges JSON in config.json:", err);
    Deno.exit(1);
  }

  // Validieren, dass wir ein Objekt mit endpoints-Liste haben
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Config).endpoints)
  ) {
    console.error(
      "❌ Ungültiges Format in config.json – es muss { endpoints: [ ... ] } sein.",
    );
    Deno.exit(1);
  }

  const configJson = parsed as Config;
  const endpoints = configJson.endpoints;

  // 2) Git-Repo-Daten aus ENV
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";

  if (!owner || !repo) {
    console.error(
      "❌ Bitte GITHUB_OWNER und GITHUB_REPO als ENV-Variablen setzen.",
    );
    Deno.exit(1);
  }

  const gitRepo: GitRepoInfo = { owner, repo, branch };

  return { endpoints, gitRepo };
}
