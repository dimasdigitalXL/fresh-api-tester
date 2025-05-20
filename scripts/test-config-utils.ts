// scripts/test-config-utils.ts

import {
  replaceWithFallback,
  safeReplace,
} from "../src/api-tester/core/utils.ts";

console.log(
  "🔧 replaceWithFallback(undefined):",
  replaceWithFallback(undefined, "_X"),
);

console.log("🔧 replaceWithFallback('Y'):", replaceWithFallback("Y", "_X"));

// safeReplace nimmt jetzt (template: string, replacements: Record<string,string>)
console.log("🔧 safeReplace:", safeReplace("foo${BAR}baz", { BAR: "_BAR_" }));
