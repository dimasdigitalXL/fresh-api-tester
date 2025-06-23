#!/usr/bin/env -S deno run --allow-read

import { JSONArray, JSONObject, mergeJson } from "./jsonMerge.ts";

// Deine tatsächlichen Dateien im Projekt
const OLD = "src/api-tester/expected/Get_List_Sales_Orders.json";
const NEW = "src/api-tester/expected/Get_List_Sales_Orders_updated_v1.json";

try {
  Deno.statSync(OLD);
  Deno.statSync(NEW);
} catch {
  console.error(
    "❌ Eine oder beide Dateien wurden nicht gefunden:\n",
    OLD,
    "\n",
    NEW,
  );
  Deno.exit(1);
}

const oldText = Deno.readTextFileSync(OLD);
const newText = Deno.readTextFileSync(NEW);

const oldJ = JSON.parse(oldText) as JSONObject;
const newJ = JSON.parse(newText) as JSONObject;

// Erstes Element aus data[] extrahieren
const oldArr = (oldJ["data"] as JSONArray)[0] ?? {};
const newArr = (newJ["data"] as JSONArray)[0] ?? {};

console.log("=== MERGED STRUCTURE ===");
console.log(JSON.stringify(mergeJson(oldArr, newArr), null, 2));
