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

/**
 * Assert-Hilfsfunktion, um sicherzustellen, dass ein Wert ein Objekt ist.
 * Wirft eine Exception, wenn nicht.
 */
function assertObject(
  x: unknown,
  ctx: string,
): asserts x is Record<string, unknown> {
  if (typeof x !== "object" || x === null) {
    throw new Error(`${ctx} muss ein Objekt sein.`);
  }
}

/**
 * Lädt die Konfiguration aus einer config.json-Datei.
 * Sucht in mehreren vordefinierten Pfaden (bzw. über CONFIG_PATH in ENV).
 * Validiert anschließend, dass:
 *  - "endpoints" ein nicht-leeres Array ist,
 *  - jeder Eintrag in endpoints über name, url und method verfügt,
 *  - ggf. owner, repo und branch für gitRepo vorhanden sind (ENV oder JSON).
 *
 * @returns Konfigurationsobjekt mit endpoints und gitRepo
 * @throws Error, wenn keine gültige config.json gefunden oder Felder ungültig sind.
 */
export async function loadConfig(): Promise<Config> {
  // 1) Mögliche Orte für config.json
  const envPath = Deno.env.get("CONFIG_PATH");
  const candidates = envPath ? [envPath] : [
    "config.json",
    "src/api-tester/config.json",
    "api-tester/config.json",
    "src/config.json",
  ];

  let rawConfig: string | undefined;
  let usedPath: string | undefined;

  for (const rel of candidates) {
    const absolute = resolveProjectPath(rel);
    if (existsSync(absolute)) {
      rawConfig = await Deno.readTextFile(absolute);
      usedPath = absolute;
      break;
    }
  }

  if (!rawConfig || !usedPath) {
    const tried = candidates.map((c) => resolveProjectPath(c)).join("\n  ");
    throw new Error(
      `Fehler: Keine config.json gefunden. Ich habe gesucht unter:\n  ${tried}`,
    );
  }

  console.log(`🔧 Lade Konfiguration aus ${usedPath}`);

  // 2) JSON parsen
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ungültiges JSON in "${usedPath}": ${msg}`);
  }
  assertObject(parsed, `Inhalt von "${usedPath}"`);

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

    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(
        `endpoints[${i}].name muss ein nicht-leerer String sein.`,
      );
    }
    if (typeof url !== "string" || url.trim() === "") {
      throw new Error(`endpoints[${i}].url muss ein nicht-leerer String sein.`);
    }
    if (typeof method !== "string" || method.trim() === "") {
      throw new Error(
        `endpoints[${i}].method muss ein nicht-leerer String sein.`,
      );
    }

    return {
      name,
      url,
      method: method as Method,
      requiresId: Boolean(e.requiresId),
      expectedStructure: typeof e.expectedStructure === "string" &&
          e.expectedStructure.trim() !== ""
        ? e.expectedStructure
        : undefined,
      headers: typeof e.headers === "object" && e.headers !== null
        ? (e.headers as Record<string, string>)
        : undefined,
      query: typeof e.query === "object" && e.query !== null
        ? (e.query as Record<string, string | number>)
        : undefined,
      bodyFile: typeof e.bodyFile === "string" && e.bodyFile.trim() !== ""
        ? e.bodyFile
        : undefined,
    };
  });

  // 4) Git-Repo-Info: zuerst aus ENV lesen, sonst aus JSON
  let owner = Deno.env.get("GITHUB_OWNER") ?? undefined;
  let repo = Deno.env.get("GITHUB_REPO") ?? undefined;
  let branch = Deno.env.get("GITHUB_BRANCH") ?? undefined;

  if (!owner || !repo) {
    const rawGit = (parsed as Record<string, unknown>).gitRepo;
    assertObject(rawGit, `"gitRepo" in "${usedPath}"`);

    if (!owner && typeof rawGit.owner === "string") owner = rawGit.owner;
    if (!repo && typeof rawGit.repo === "string") repo = rawGit.repo;
    if (!branch && typeof rawGit.branch === "string") branch = rawGit.branch;
  }

  // 5) Validieren, dass owner und repo jetzt gesetzt sind
  if (!owner || !repo) {
    throw new Error(
      `Bitte GITHUB_OWNER und GITHUB_REPO als ENV-Variablen setzen oder in "${usedPath}" unter "gitRepo" angeben.`,
    );
  }
  // Branch auf "main" defaulten, falls nicht gesetzt
  branch = branch ?? "main";

  return {
    endpoints,
    gitRepo: { owner, repo, branch },
  };
}
