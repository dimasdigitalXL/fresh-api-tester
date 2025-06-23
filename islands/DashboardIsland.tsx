/** @jsxImportSource preact */
/** islands/DashboardIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { RunTestsIsland } from "./RunTestsIsland.tsx";
import { LastRunIsland } from "./LastRunIsland.tsx";
import { RoutesIsland } from "./RoutesIsland.tsx";
import { RecursiveDiff } from "./CompareIsland.tsx";

// Hier die JSON-Typen importieren:
import type { JSONArray, JSONObject } from "../scripts/jsonMerge.ts";

interface EndpointResponse {
  data: unknown; // entspricht { data: […], extra: {…} }
}

// Gemeinsamer Panel-Style
const panelStyle = (dark: boolean) => ({
  background: dark ? "#334155" : "#ffffff",
  borderRadius: "0.75rem",
  padding: "1rem",
  boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.1)",
  marginTop: "1rem",
});

// Stil für linke Endpoint-Buttons
const epButtonStyle = {
  background: "#f3f3f3",
  color: "#000000",
  border: "1px solid #ddd",
  borderRadius: "0.375rem",
  padding: "0.5rem 1rem",
  width: "100%",
  textAlign: "left" as const,
  cursor: "pointer",
};

export default function DashboardIsland() {
  // Light/Dark Mode
  const darkMode = useSignal(false);
  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode.value
      ? "#0f172a"
      : "#ffffff";
  }, [darkMode.value]);

  // UI-State
  const showEndpoints = useSignal(false);
  const showRoutes = useSignal(false);
  const showComparison = useSignal(false);

  // Endpunkte-Liste
  const endpoints = useSignal<string[]>([]);
  const loadingE = useSignal(false);
  const errorE = useSignal<string | null>(null);

  // Gewählter Endpunkt
  const selectedEP = useSignal<string | null>(null);
  const epDetails = useSignal<unknown>(null);
  const loadingEPDet = useSignal(false);
  const errorEPDet = useSignal<string | null>(null);

  // Vergleichs-Daten
  const oldStruct = useSignal<EndpointResponse | null>(null);
  const newStruct = useSignal<EndpointResponse | null>(null);
  const loadingComp = useSignal(false);
  const errorComp = useSignal<string | null>(null);

  // Farben & Hintergründe
  const titleColor = "#8BC53F";
  const btnBlueBg = darkMode.value ? "#1e3a8a" : "#2563eb";
  const leftBg = darkMode.value ? "#1e293b" : "#ecfdf5";
  const centerBg = darkMode.value ? "#111827" : "#d1fae5";
  const rightBg = darkMode.value ? "#374151" : "#a7f3d0";
  const panelText = darkMode.value ? "#ffffff" : "#000000";

  // 1) Endpunkte laden
  const loadEndpoints = async () => {
    showEndpoints.value = true;
    loadingE.value = true;
    errorE.value = null;
    try {
      const res = await fetch("/api/get-config-endpoints");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: string[] };
      endpoints.value = json.data;
    } catch (e) {
      errorE.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingE.value = false;
    }
  };

  // 2) Details eines Endpunkts laden
  const loadEndpointDetails = async (name: string) => {
    selectedEP.value = name;
    showComparison.value = false;
    epDetails.value = null;
    loadingEPDet.value = true;
    errorEPDet.value = null;
    try {
      const res = await fetch(
        `/api/get-endpoint-expected?name=${encodeURIComponent(name)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EndpointResponse;
      epDetails.value = json.data;
    } catch (e) {
      errorEPDet.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingEPDet.value = false;
    }
  };

  // 3) Alt vs. Neu laden & diffen
  const loadComparison = async () => {
    if (!selectedEP.value) return;
    showComparison.value = true;
    loadingComp.value = true;
    errorComp.value = null;
    try {
      const name = encodeURIComponent(selectedEP.value);

      const resO = await fetch(
        `/api/get-endpoint-expected?name=${name}&version=old`,
      );
      if (!resO.ok) throw new Error(`HTTP ${resO.status}`);
      const oJ = (await resO.json()) as EndpointResponse;

      const resN = await fetch(
        `/api/get-endpoint-expected?name=${name}`,
      );
      if (!resN.ok) throw new Error(`HTTP ${resN.status}`);
      const nJ = (await resN.json()) as EndpointResponse;

      oldStruct.value = oJ;
      newStruct.value = nJ;
    } catch (e) {
      errorComp.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingComp.value = false;
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "auto 1fr",
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
      }}
    >
      {/* HEADER */}
      <header
        style={{
          gridColumn: "1 / 4",
          gridRow: "1 / 2",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          alignItems: "center",
          backgroundColor: "#ffffff",
          padding: "1rem",
        }}
      >
        {/* Dark/Light Toggle */}
        <div
          style={{
            gridColumn: "1 / 2",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <button
            type="button"
            onClick={() => (darkMode.value = !darkMode.value)}
            style={{
              padding: "0.5rem",
              background: darkMode.value ? "#374151" : "#f3f4f6",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            {darkMode.value ? "☀️" : "🌙"}
          </button>
        </div>
        {/* Titel & letzter Lauf */}
        <div style={{ gridColumn: "2 / 3", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              margin: 0,
              color: titleColor,
              fontWeight: "bold",
            }}
          >
            API-Tester
          </h1>
          <p style={{ margin: 0, color: "#000000" }}>
            Letzter Lauf: <LastRunIsland />
          </p>
        </div>
        {/* Logo */}
        <div
          style={{
            gridColumn: "3 / 4",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <img
            src="/digitalXL-logo.png"
            alt="Logo"
            style={{ width: "10rem" }}
          />
        </div>
      </header>

      {/* LINKS: Endpunkte */}
      <aside
        style={{
          gridColumn: "1 / 2",
          gridRow: "2 / 3",
          backgroundColor: leftBg,
          padding: "1rem",
          color: panelText,
          overflowY: "auto",
        }}
      >
        {showEndpoints.value && (
          <div style={{ ...panelStyle(darkMode.value), textAlign: "center" }}>
            <h2 style={{ margin: 0, marginBottom: "0.5rem" }}>Endpunkte</h2>
            {loadingE.value && <p>Lade…</p>}
            {errorE.value && <p style={{ color: "red" }}>{errorE.value}</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {endpoints.value.map((ep) => (
                <li key={ep} style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() =>
                      loadEndpointDetails(ep)}
                    style={epButtonStyle}
                  >
                    {ep.replace(/^\/api\//, "")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* MITTE: Tests + Buttons + Vergleich */}
      <div
        style={{
          gridColumn: "2 / 3",
          gridRow: "2 / 3",
          backgroundColor: centerBg,
          color: panelText,
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <RunTestsIsland dark={darkMode.value} />

        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            gap: "0.5rem",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={loadEndpoints}
            style={{
              padding: "0.75rem 1.5rem",
              background: btnBlueBg,
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Endpunkte
          </button>
          <button
            type="button"
            onClick={() => (showRoutes.value = !showRoutes.value)}
            style={{
              padding: "0.75rem 1.5rem",
              background: btnBlueBg,
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Verfügbare Routen
          </button>
          <button
            type="button"
            disabled={!selectedEP.value}
            onClick={loadComparison}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#10B981",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: selectedEP.value ? "pointer" : "not-allowed",
              opacity: selectedEP.value ? 1 : 0.5,
            }}
          >
            Vergleich
          </button>
        </div>

        {/* Routen */}
        {showRoutes.value && (
          <div
            style={{
              ...panelStyle(darkMode.value),
              marginTop: "1rem",
              textAlign: "left",
            }}
          >
            <RoutesIsland />
          </div>
        )}

        {/* Vergleichs-Panel */}
        {showComparison.value && oldStruct.value && newStruct.value && (
          <div
            style={{
              ...panelStyle(darkMode.value),
              margin: "1rem auto",
              maxWidth: "36rem",
              textAlign: "left",
            }}
          >
            <h2 style={{ margin: 0, textAlign: "center" }}>Vergleich</h2>
            <div style={{ height: "0.5rem" }} />

            {/* Schwarzer Kasten mit echtem JSON-Look */}
            <div
              style={{
                background: "#000000",
                color: "#ffffff",
                padding: "1rem",
                borderRadius: "0.375rem",
                overflowX: "auto",
                fontFamily: "monospace",
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                <li style={{ paddingLeft: 0, color: "#ffffff" }}>
                  "{`data`}" : {"{"}
                </li>
                {(() => {
                  const wrapO = oldStruct.value!.data as { data: JSONArray };
                  const wrapN = newStruct.value!.data as { data: JSONArray };
                  const oldArr = (wrapO.data[0] ?? {}) as JSONObject;
                  const newArr = (wrapN.data[0] ?? {}) as JSONObject;
                  return <RecursiveDiff old={oldArr} neu={newArr} depth={1} />;
                })()}
                <li style={{ paddingLeft: 0, color: "#ffffff" }}>
                  {"}"}
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* RECHTS: Datastruktur */}
      <section
        style={{
          gridColumn: "3 / 4",
          gridRow: "2 / 3",
          backgroundColor: rightBg,
          padding: "1rem",
          color: panelText,
          overflowY: "auto",
        }}
      >
        {selectedEP.value && (
          <div style={panelStyle(darkMode.value)}>
            <h3
              style={{ margin: 0, marginBottom: "0.5rem", textAlign: "center" }}
            >
              Datastruktur: <code>{selectedEP.value}</code>
            </h3>
            {loadingEPDet.value && <p>Lade…</p>}
            {errorEPDet.value && (
              <p style={{ color: "red" }}>{errorEPDet.value}</p>
            )}
            {epDetails.value && (
              <pre
                style={{
                  background: "#000000",
                  color: "#ffffff",
                  padding: "1rem",
                  borderRadius: "0.375rem",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  margin: 0,
                }}
              >
                {JSON.stringify(epDetails.value, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
