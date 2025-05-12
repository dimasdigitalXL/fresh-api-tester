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
  query?: Record<string, string>;
  bodyFile?: string;
}

export interface Config {
  endpoints: EndpointConfig[];
}

export async function loadConfig(): Promise<Config> {
  // jetzt direkt im Ordner src/api-tester/config.json
  const pathToConfig = resolveProjectPath("config.json");
  try {
    const raw = await Deno.readTextFile(pathToConfig);
    return JSON.parse(raw) as Config;
  } catch (err) {
    console.error("❌ Fehler beim Laden der config.json:", err);
    Deno.exit(1);
  }
}
