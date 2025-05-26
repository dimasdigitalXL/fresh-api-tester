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

export interface GitRepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

export interface Config {
  endpoints: EndpointConfig[];
  gitRepo: GitRepoInfo;
}

function assertObject(
  x: unknown,
  ctx: string,
): asserts x is Record<string, unknown> {
  if (typeof x !== "object" || x === null) {
    throw new Error(`${ctx} muss ein Objekt sein.`);
  }
}

export async function loadConfig(): Promise<Config> {
  // 1) Pfad ermitteln
  const configFile = Deno.env.get("CONFIG_PATH") ?? "config.json";
  const configPath = resolveProjectPath(configFile);

  // 2) Einlesen
  let raw: string;
  try {
    raw = await Deno.readTextFile(configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Fehler beim Lesen von "${configPath}": ${msg}`);
  }

  // 3) Parsen
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültiges JSON in "${configPath}": ${msg}`);
  }
  assertObject(parsed, `Konfiguration in "${configPath}"`);

  // 4) Endpoints validieren
  const endpointsRaw = parsed.endpoints;
  if (!Array.isArray(endpointsRaw) || endpointsRaw.length === 0) {
    throw new Error(
      `"endpoints" in "${configPath}" muss ein nicht-leeres Array sein.`,
    );
  }
  const endpoints: EndpointConfig[] = endpointsRaw.map((e, i) => {
    assertObject(e, `endpoints[${i}]`);
    const name = e.name;
    const url = e.url;
    const method = e.method;
    if (typeof name !== "string" || name === "") {
      throw new Error(
        `endpoints[${i}].name muss ein nicht-leerer String sein.`,
      );
    }
    if (typeof url !== "string" || url === "") {
      throw new Error(`endpoints[${i}].url muss ein nicht-leerer String sein.`);
    }
    if (typeof method !== "string") {
      throw new Error(`endpoints[${i}].method muss ein String sein.`);
    }
    return {
      name,
      url,
      method: method as Method,
      requiresId: Boolean(e.requiresId),
      expectedStructure: typeof e.expectedStructure === "string"
        ? e.expectedStructure
        : undefined,
      headers: typeof e.headers === "object" && e.headers !== null
        ? (e.headers as Record<string, string>)
        : undefined,
      query: typeof e.query === "object" && e.query !== null
        ? (e.query as Record<string, string | number>)
        : undefined,
      bodyFile: typeof e.bodyFile === "string" ? e.bodyFile : undefined,
    };
  });

  // 5) Git-Repo aus ENV oder config.json
  //    Zuerst aus ENV
  let owner = Deno.env.get("GITHUB_OWNER") ?? undefined;
  let repo = Deno.env.get("GITHUB_REPO") ?? undefined;
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";

  if (!owner || !repo) {
    // dann aus parsed.gitRepo
    const rawGit = parsed.gitRepo;
    assertObject(rawGit, `"gitRepo" in "${configPath}"`);
    if (typeof rawGit.owner === "string") owner = rawGit.owner;
    if (typeof rawGit.repo === "string") repo = rawGit.repo;
    if (typeof rawGit.branch === "string") {
      // überschreibt Default nur wenn String
      // (ansonsten bleibt "main" oder ENV)
      // tslint:disable-next-line: no-unused-expression
      rawGit.branch && (branch as string) === rawGit.branch;
    }
  }

  if (!owner || !repo) {
    throw new Error(
      "Bitte GITHUB_OWNER und GITHUB_REPO als ENV-Variablen setzen oder in config.json unter gitRepo angeben.",
    );
  }

  const gitRepo = { owner, repo, branch };

  return { endpoints, gitRepo };
}
