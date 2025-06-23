/** @jsxImportSource preact */
/** islands/CompareIsland.tsx */
import type { JSONArray, JSONObject } from "../scripts/jsonMerge.ts";

export interface RecursiveDiffProps {
  old: JSONObject | JSONArray;
  neu: JSONObject | JSONArray;
  depth?: number;
}

export function RecursiveDiff({ old, neu, depth = 0 }: RecursiveDiffProps) {
  // 1) Wenn beides Arrays: nur das erste Element diffen
  if (Array.isArray(old) && Array.isArray(neu)) {
    const o = (old as JSONArray)[0] ?? {};
    const n = (neu as JSONArray)[0] ?? {};
    return (
      <RecursiveDiff
        old={o as JSONObject}
        neu={n as JSONObject}
        depth={depth}
      />
    );
  }

  // 2) Primitive → nur anzeigen, wenn unterschiedlich
  if (
    typeof old !== "object" || old === null ||
    typeof neu !== "object" || neu === null
  ) {
    if (old !== neu) {
      return (
        <div style={{ paddingLeft: depth * 16 + "px" }}>
          <span style={{ color: "#f87171" }}>
            ~ {JSON.stringify(old)} → {JSON.stringify(neu)}
          </span>
        </div>
      );
    }
    return null;
  }

  // 3) Beide Objekte → Keys in originaler Reihenfolge
  const oObj = old as JSONObject;
  const nObj = neu as JSONObject;
  const keys = Object.keys(oObj).concat(
    Object.keys(nObj).filter((k) => !(k in oObj)),
  ); // erst alte Reihenfolge, dann neue ergänzen

  // 4) Iteriere und clustere unveränderte Runs
  const items: preact.VNode[] = [];
  let inUnchangedRun = false;

  for (const key of keys) {
    const hasOld = key in oObj;
    const hasNew = key in nObj;
    const oVal = oObj[key];
    const nVal = nObj[key];

    // unverändert?
    const isPrimitive = (typeof oVal !== "object" || oVal === null) &&
      (typeof nVal !== "object" || nVal === null);
    const unchanged = hasOld && hasNew &&
      JSON.stringify(oVal) === JSON.stringify(nVal) &&
      isPrimitive;

    if (unchanged) {
      // beginne oder setze Fortsetzung eines unchanged-Runs
      if (!inUnchangedRun) {
        items.push(
          <li
            key={`ellipsis-${depth}-${key}`}
            style={{ color: "#888888", paddingLeft: depth * 16 + "px" }}
          >
            (…)
          </li>,
        );
        inUnchangedRun = true;
      }
      // und sonst nichts weiter rendern
      continue;
    }
    // sobald wir hier ankommen, endet ein unchanged-Run
    inUnchangedRun = false;

    // entfernte Keys
    if (hasOld && !hasNew) {
      items.push(
        <li
          key={`-_${key}`}
          style={{ color: "#f87171", paddingLeft: depth * 16 + "px" }}
        >
          − {key}: {JSON.stringify(oVal)}
        </li>,
      );
      continue;
    }
    // neue Keys
    if (!hasOld && hasNew) {
      items.push(
        <li
          key={`+_${key}`}
          style={{ color: "#4ade80", paddingLeft: depth * 16 + "px" }}
        >
          + {key}: {JSON.stringify(nVal)}
        </li>,
      );
      continue;
    }
    // verschachtelte Objekte
    if (
      typeof oVal === "object" && oVal !== null &&
      typeof nVal === "object" && nVal !== null
    ) {
      items.push(
        <li key={`=_${key}`} style={{ paddingLeft: depth * 16 + "px" }}>
          <strong>{key}:</strong>
          <RecursiveDiff
            old={oVal as JSONObject | JSONArray}
            neu={nVal as JSONObject | JSONArray}
            depth={depth + 1}
          />
        </li>,
      );
      continue;
    }
    // geänderte Primitives
    if (oVal !== nVal) {
      items.push(
        <li
          key={`~_${key}`}
          style={{ color: "#facc15", paddingLeft: depth * 16 + "px" }}
        >
          ~ {key}: {JSON.stringify(oVal)} → {JSON.stringify(nVal)}
        </li>,
      );
      continue;
    }
  }

  // Falls gar keine Einträge → keine Anzeige
  if (items.length === 0) return null;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items}
    </ul>
  );
}
