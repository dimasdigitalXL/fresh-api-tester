/** scripts/jsonMerge.ts */

/**
 * Definierte Typen für JSON-Werte
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONArray;

export interface JSONObject {
  [key: string]: JSONValue;
}

export interface JSONArray extends Array<JSONValue> {}

/**
 * Führt zwei JSON-Strukturen (alt vs. neu) zu einem Superset zusammen.
 * - Bei primitiven Werten gewinnt newObj.
 * - Bei Objekten werden Keys rekursiv gemerged.
 * - Bei Arrays:
 *   • Bei Arrays primitiver Werte: Union (Duplikate entfernt).
 *   • Bei Arrays von Objekten: Element-für-Element mergen (Index-basiert).
 *
 * @param oldObj Eine ältere JSON-Struktur
 * @param newObj Eine neuere JSON-Struktur
 * @returns Das gemergte JSONValue
 */
export function mergeJson(
  oldObj: JSONValue,
  newObj: JSONValue,
): JSONValue {
  // 1) Primitive oder null/undefined → newObj bevorzugen
  if (
    typeof oldObj !== "object" || oldObj === null ||
    typeof newObj !== "object" || newObj === null
  ) {
    // Falls newObj undefined ist (bei fehlendem Key), dann oldObj
    return newObj !== undefined ? newObj : oldObj;
  }

  // 2) Arrays
  const isOldArr = Array.isArray(oldObj);
  const isNewArr = Array.isArray(newObj);
  if (isOldArr || isNewArr) {
    const oldArr = isOldArr ? (oldObj as JSONArray) : [];
    const newArr = isNewArr ? (newObj as JSONArray) : [];

    // a) Arrays primitiver Werte: Union
    const bothPrimitive = oldArr.every((v) => typeof v !== "object") &&
      newArr.every((v) => typeof v !== "object");
    if (bothPrimitive) {
      return Array.from(new Set<JSONValue>([...oldArr, ...newArr]));
    }

    // b) Arrays von Objekten (oder gemischt): Element-für-Element
    const maxLen = Math.max(oldArr.length, newArr.length);
    const merged: JSONArray = [];
    for (let i = 0; i < maxLen; i++) {
      merged[i] = mergeJson(oldArr[i], newArr[i]);
    }
    return merged;
  }

  // 3) Nicht-Null-Objekte → rekursives Mergen
  const result: JSONObject = {};
  const oldJson = oldObj as JSONObject;
  const newJson = newObj as JSONObject;
  const keys = new Set<string>([
    ...Object.keys(oldJson),
    ...Object.keys(newJson),
  ]);

  for (const key of keys) {
    result[key] = mergeJson(oldJson[key], newJson[key]);
  }

  return result;
}
