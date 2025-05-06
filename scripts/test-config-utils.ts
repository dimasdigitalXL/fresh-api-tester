// scripts/test-config-utils.ts

import {
  replaceWithFallback,
  resolveProjectPath,
  safeReplace,
} from "../src/api-tester/core/utils.ts";
import { loadConfig } from "../src/api-tester/core/configLoader.ts";

console.log(
  "🔍 resolveProjectPath:",
  resolveProjectPath("api-tester", "config.json"),
);

console.log("🔧 safeReplace:", safeReplace("foo_BAR", "_BAR", "_BAZ"));
console.log(
  "🔧 replaceWithFallback:",
  replaceWithFallback(undefined, "_X", "_Y"),
);

const cfg = await loadConfig();
console.log(
  "🚀 Geladene Endpoints:",
  cfg.endpoints.map((e) => e.name).join(", "),
);
