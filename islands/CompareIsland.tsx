/** @jsxImportSource preact */
/** islands/CompareIsland.tsx */
import type { JSONArray, JSONObject } from "../scripts/jsonMerge.ts";

export interface RecursiveDiffProps {
  old: string | number | boolean | JSONObject | JSONArray; // Erweiterung auf primitive Typen
  neu: string | number | boolean | JSONObject | JSONArray; // Erweiterung auf primitive Typen
  depth?: number;
}

export function RecursiveDiff({ old, neu, depth = 0 }: RecursiveDiffProps) {
  // Debug-Logs (können entfernt werden, wenn alles funktioniert)
  console.log("Vergleich – Old:", old);
  console.log("Vergleich – Neu:", neu);

  // Workaround: Wenn einer ein Array und der andere ein Objekt ist,
  // packe den Objekt-Wert in ein Array, damit der Array-Vergleich greift.
  if (Array.isArray(old) && !Array.isArray(neu)) {
    return (
      <RecursiveDiff
        old={old}
        neu={[neu] as JSONArray}
        depth={depth}
      />
    );
  }
  if (!Array.isArray(old) && Array.isArray(neu)) {
    return (
      <RecursiveDiff
        old={[old] as JSONArray}
        neu={neu}
        depth={depth}
      />
    );
  }

  // 1) Beide Arrays → Element-für-Element vergleichen
  if (Array.isArray(old) && Array.isArray(neu)) {
    const length = Math.max(old.length, neu.length);
    const items: preact.VNode[] = [];
    for (let i = 0; i < length; i++) {
      const o = old[i] ?? {};
      const n = neu[i] ?? {};
      items.push(
        <RecursiveDiff
          key={`array-${depth}-${i}`}
          old={o}
          neu={n}
          depth={depth}
        />,
      );
    }
    return <>{items}</>;
  }

  // 2) Both are objects → Key-basierter Vergleich
  if (
    typeof old === "object" &&
    old !== null &&
    typeof neu === "object" &&
    neu !== null
  ) {
    const oObj = old as JSONObject;
    const nObj = neu as JSONObject;

    // Wenn das neue Objekt komplett leer ist, Hinweis anzeigen
    if (Object.keys(nObj).length === 0) {
      return (
        <div style={{ paddingLeft: depth * 16 + "px" }}>
          <span style={{ color: "#f87171" }}>
            Die Antwort für `Get_View` ist leer: Keine Daten verfügbar.
          </span>
        </div>
      );
    }

    // Schlüssel-Merge: erst alte Reihenfolge, dann neue ergänzen
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

      console.log(`Vergleich für Schlüssel "${key}":`, oVal, nVal);

      const isPrimitive = (typeof oVal !== "object" || oVal === null) &&
        (typeof nVal !== "object" || nVal === null);
      const unchanged = hasOld &&
        hasNew &&
        JSON.stringify(oVal) === JSON.stringify(nVal) &&
        isPrimitive;

      // 2a) Unverändert (nur einmal „(...)“ darstellen)
      if (unchanged) {
        if (!inUnchangedRun) {
          items.push(
            <li
              key={`ellipsis-${depth}-${key}`}
              style={{
                color: "#888888",
                paddingLeft: depth * 16 + "px",
              }}
            >
              (…)
            </li>,
          );
          inUnchangedRun = true;
        }
        continue;
      }
      inUnchangedRun = false;

      // 2b) Entfernte Keys
      if (hasOld && !hasNew) {
        items.push(
          <li
            key={`-_${key}`}
            style={{
              color: "#f87171",
              paddingLeft: depth * 16 + "px",
            }}
          >
            − {key}: {JSON.stringify(oVal)}
          </li>,
        );
        continue;
      }
      // 2c) Neue Keys
      if (!hasOld && hasNew) {
        items.push(
          <li
            key={`+_${key}`}
            style={{
              color: "#4ade80",
              paddingLeft: depth * 16 + "px",
            }}
          >
            + {key}: {JSON.stringify(nVal)}
          </li>,
        );
        continue;
      }
      // 2d) Verschachtelte Objekte/Arrays
      if (
        typeof oVal === "object" &&
        oVal !== null &&
        typeof nVal === "object" &&
        nVal !== null
      ) {
        items.push(
          <li
            key={`=_${key}`}
            style={{ paddingLeft: depth * 16 + "px" }}
          >
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
      // 2e) Geänderte primitive Werte
      if (oVal !== nVal) {
        items.push(
          <li
            key={`~_${key}`}
            style={{
              color: "#facc15",
              paddingLeft: depth * 16 + "px",
            }}
          >
            ~ {key}: {JSON.stringify(oVal)} → {JSON.stringify(nVal)}
          </li>,
        );
        continue;
      }
    }

    if (items.length === 0) {
      // Keine Einträge → keine Anzeige
      return null;
    }

    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items}
      </ul>
    );
  }

  // 3) Primitive Werte → nur anzeigen, wenn unterschiedlich
  if (old !== neu) {
    return (
      <div style={{ paddingLeft: depth * 16 + "px" }}>
        <span style={{ color: "#f87171" }}>
          ~ {JSON.stringify(old)} → {JSON.stringify(neu)}
        </span>
      </div>
    );
  }

  // 4) Alles andere → nichts anzeigen
  return null;
}
