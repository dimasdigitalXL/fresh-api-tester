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

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function loadConfig(): Promise<Config> {
  // 1) Endpoints aus config.json laden
  const pathToConfig = resolveProjectPath("config.json");
  let raw: string;
  try {
    raw = await Deno.readTextFile(pathToConfig);
  } catch (err: unknown) {
    throw new Error(
      `Fehler beim Lesen der config.json: ${getErrorMessage(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(`Ungültiges JSON in config.json: ${getErrorMessage(err)}`);
  }

  // Validieren, dass wir ein Objekt mit endpoints-Liste haben
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Config).endpoints)
  ) {
    throw new Error(
      "Ungültiges Format in config.json – es muss { endpoints: [ ... ] } sein.",
    );
  }
  const endpoints = (parsed as Config).endpoints;

  // 2) Git-Repo-Daten aus ENV
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";

  if (!owner || !repo) {
    throw new Error(
      "Bitte GITHUB_OWNER und GITHUB_REPO als ENV-Variablen setzen.",
    );
  }

  const gitRepo: GitRepoInfo = { owner, repo, branch };
  return { endpoints, gitRepo };
}
