// src/api-tester/core/configLoader.ts
import { resolveProjectPath } from "./utils.ts";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EndpointConfig {
  name: string;
  url: string;
  method: Method;
  requiresId?: boolean;
  expectedStructure?: string;
  query?: Record<string, string>;
  bodyFile?: string;
}

export interface Config {
  endpoints: EndpointConfig[];
}

export async function loadConfig(): Promise<Config> {
  try {
    const pathToConfig = resolveProjectPath("api-tester", "config.json");
    const raw = await Deno.readTextFile(pathToConfig);
    return JSON.parse(raw) as Config;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("❌ Fehler beim Laden der config.json:", err.message);
    } else {
      console.error("❌ Fehler beim Laden der config.json:", String(err));
    }
    Deno.exit(1);
  }
}
