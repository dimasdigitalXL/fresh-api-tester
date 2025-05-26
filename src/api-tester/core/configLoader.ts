// src/api-tester/core/configLoader.ts

import { resolveProjectPath } from "./utils.ts";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";

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
  // 1) Konfig-Pfade auf Try-List
  const envPath = Deno.env.get("CONFIG_PATH");
  const candidates = envPath ? [envPath] : [
    // relativ zu project/src
    "config.json",
    // relativ zu project/src/api-tester
    "api-tester/config.json",
  ];

  let raw: string | undefined;
  let usedPath: string | undefined;

  for (const rel of candidates) {
    const p = resolveProjectPath(rel);
    try {
      if (existsSync(p)) {
        raw = await Deno.readTextFile(p);
        usedPath = p;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!raw || !usedPath) {
    throw new Error(
      `Fehler: Keine config.json gefunden. Ich habe gesucht unter:\n  ${
        candidates
          .map((c) => resolveProjectPath(c))
          .join("\n  ")
      }`,
    );
  }

  console.log(`🔧 Lade Konfiguration aus ${usedPath}`);

  // 2) JSON parsen
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültiges JSON in "${usedPath}": ${msg}`);
  }
  assertObject(parsed, `Konfiguration in "${usedPath}"`);

  // 3) Endpoints validieren
  const endpointsRaw = (parsed as Record<string, unknown>).endpoints;
  if (!Array.isArray(endpointsRaw) || endpointsRaw.length === 0) {
    throw new Error(
      `"endpoints" in "${usedPath}" muss ein nicht-leeres Array sein.`,
    );
  }
  const endpoints: EndpointConfig[] = endpointsRaw.map((e, i) => {
    assertObject(e, `endpoints[${i}]`);
    const name = e.name;
    const url = e.url;
    const method = e.method;
    if (typeof name !== "string" || !name) {
      throw new Error(
        `endpoints[${i}].name muss ein nicht-leerer String sein.`,
      );
    }
    if (typeof url !== "string" || !url) {
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

  // 4) Git-Repo aus ENV oder config.json
  let owner = Deno.env.get("GITHUB_OWNER") ?? undefined;
  let repo = Deno.env.get("GITHUB_REPO") ?? undefined;
  let branch = Deno.env.get("GITHUB_BRANCH") ?? "main";

  if (!owner || !repo) {
    const rawGit = (parsed as Record<string, unknown>).gitRepo;
    assertObject(rawGit, `"gitRepo" in "${usedPath}"`);
    if (typeof rawGit.owner === "string") owner = rawGit.owner;
    if (typeof rawGit.repo === "string") repo = rawGit.repo;
    if (typeof rawGit.branch === "string") branch = rawGit.branch;
  }

  if (!owner || !repo) {
    throw new Error(
      `Bitte GITHUB_OWNER und GITHUB_REPO als ENV-Variablen setzen oder in "${usedPath}" unter "gitRepo" angeben.`,
    );
  }

  return { endpoints, gitRepo: { owner, repo, branch } };
}
