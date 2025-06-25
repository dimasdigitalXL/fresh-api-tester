/** @jsxImportSource preact */
/** islands/CompareIsland.tsx */
import type { JSONArray, JSONObject } from "../scripts/jsonMerge.ts";

export interface RecursiveDiffProps {
  old: string | number | boolean | JSONObject | JSONArray; // Erweiterung auf primitive Typen
  neu: string | number | boolean | JSONObject | JSONArray; // Erweiterung auf primitive Typen
  depth?: number;
}

export function RecursiveDiff({ old, neu, depth = 0 }: RecursiveDiffProps) {
  console.log("Vergleich: Old:", old); // Logge die alten Daten
  console.log("Vergleich: Neu:", neu); // Logge die neuen Daten

  // 1) Wenn beides Arrays sind: Vergleich der einzelnen Elemente
  if (Array.isArray(old) && Array.isArray(neu)) {
    const length = Math.max(old.length, neu.length);
    const items: preact.VNode[] = [];

    for (let i = 0; i < length; i++) {
      const o = old[i] ?? {}; // Fallback auf leeres Objekt, falls Element nicht existiert
      const n = neu[i] ?? {}; // Fallback auf leeres Objekt, falls Element nicht existiert
      items.push(
        <RecursiveDiff
          key={`array-item-${i}`}
          old={o}
          neu={n}
          depth={depth}
        />,
      );
    }
    return <>{items}</>;
  }

  // 2) Wenn eines der Daten ein Array ist, aber das andere ein Objekt (z.B. Get_View)
  if (Array.isArray(old) && !Array.isArray(neu)) {
    return (
      <RecursiveDiff
        old={old[0] ?? {}}
        neu={neu}
        depth={depth}
      />
    );
  }

  // 3) Wenn es sich um ein Objekt handelt (z.B. Get_View): Direkter Vergleich des Objekts
  if (
    typeof old === "object" && old !== null &&
    typeof neu === "object" && neu !== null
  ) {
    // Überprüfen, ob `neu` leer ist
    if (Object.keys(neu).length === 0) {
      console.log("Leere Antwort für Get_View:", neu); // Logge leere Antwort
      return (
        <div style={{ paddingLeft: depth * 16 + "px" }}>
          <span style={{ color: "#f87171" }}>
            Die Antwort für `Get_View` ist leer: Keine Daten verfügbar.
          </span>
        </div>
      );
    }

    const oObj = old as JSONObject;
    const nObj = neu as JSONObject;
    const keys = Object.keys(oObj).concat(
      Object.keys(nObj).filter((k) => !(k in oObj)),
    );

    const items: preact.VNode[] = [];
    let inUnchangedRun = false;

    for (const key of keys) {
      const hasOld = key in oObj;
      const hasNew = key in nObj;
      const oVal = oObj[key];
      const nVal = nObj[key];

      console.log(`Vergleich für Schlüssel: ${key}`, oVal, nVal); // Logge die Werte für jeden Schlüssel

      const isPrimitive = (typeof oVal !== "object" || oVal === null) &&
        (typeof nVal !== "object" || nVal === null);
      const unchanged = hasOld && hasNew &&
        JSON.stringify(oVal) === JSON.stringify(nVal) &&
        isPrimitive;

      if (unchanged) {
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
        continue;
      }
      inUnchangedRun = false;

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

    if (items.length === 0) return null;

    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items}
      </ul>
    );
  }

  // 4) Wenn es primitive Werte sind, direkt vergleichen
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
