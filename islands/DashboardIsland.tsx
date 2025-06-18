/** @jsxImportSource preact */
/** islands/DashboardIsland.tsx */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { RunTestsIsland } from "./RunTestsIsland.tsx";
import { LastRunIsland } from "./LastRunIsland.tsx";
import { RoutesIsland } from "./RoutesIsland.tsx";

// Panel-Style-Fabrik: weiß im Light, dunkelgrau im Dark
const panelStyle = (dark: boolean) => ({
  background: dark ? "#334155" : "#ffffff",
  borderRadius: "0.75rem",
  padding: "1rem",
  boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.1)",
  marginTop: "1rem",
});

export default function DashboardIsland() {
  // Light / Dark Toggle
  const darkMode = useSignal(false);
  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode.value
      ? "#0f172a"
      : "#ffffff";
  }, [darkMode.value]);

  // Panels-State
  const showEndpoints = useSignal(false);
  const showRoutes = useSignal(false);

  // Endpoints-Daten
  const endpoints = useSignal<string[]>([]);
  const loadingE = useSignal(false);
  const errorE = useSignal<string | null>(null);

  const loadEndpoints = async () => {
    showEndpoints.value = true;
    loadingE.value = true;
    errorE.value = null;
    try {
      const res = await fetch("/api/get-config-endpoints");
      const json = (await res.json()) as { data: string[] };
      endpoints.value = json.data;
    } catch (e) {
      errorE.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingE.value = false;
    }
  };

  // Farben & Styles
  const titleColor = "#8BC53F"; // Blattgrün
  const headerBg = "#ffffff"; // immer weiß
  const btnBlueBg = darkMode.value ? "#1e3a8a" : "#2563eb";

  const leftBg = darkMode.value ? "#1e293b" : "#ecfdf5";
  const centerBg = darkMode.value ? "#111827" : "#d1fae5";
  const rightBg = darkMode.value ? "#374151" : "#a7f3d0";

  const borderR = darkMode.value ? "1px solid #374151" : "1px solid #10B981";
  const borderL = borderR;

  const panelText = darkMode.value ? "#ffffff" : "#000000";

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
          backgroundColor: headerBg,
          padding: "1rem",
        }}
      >
        {/* Dark/Light-Toggle */}
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
        {/* Titel & Letzter Lauf */}
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
          <p style={{ margin: 0, color: panelText }}>
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
            alt="digitalXL Logo"
            style={{ width: "10rem", height: "auto" }}
          />
        </div>
      </header>

      {/* LINKS: Endpunkte */}
      <aside
        style={{
          gridColumn: "1 / 2",
          gridRow: "2 / 3",
          borderRight: borderR,
          padding: "1rem",
          textAlign: "center",
          backgroundColor: leftBg,
          color: panelText,
          overflowY: "auto",
        }}
      >
        {showEndpoints.value && (
          <div style={panelStyle(darkMode.value)}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              Endpunkte
            </h2>
            {loadingE.value && <p>Lade Endpunkte…</p>}
            {errorE.value && (
              <p style={{ color: "#ef4444" }}>Fehler: {errorE.value}</p>
            )}
            {!loadingE.value && !errorE.value && (
              <ul
                style={{
                  listStyle: "disc inside",
                  lineHeight: 1.5,
                  textAlign: "left",
                  paddingLeft: "1rem",
                  margin: 0,
                }}
              >
                {endpoints.value.map((ep) => <li key={ep}>{ep}</li>)}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* MITTE: Tests + Buttons */}
      <div
        style={{
          gridColumn: "2 / 3",
          gridRow: "2 / 3",
          textAlign: "center",
          backgroundColor: centerBg,
          color: panelText,
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
            onClick={() => (showRoutes.value = true)}
            style={{
              padding: "0.75rem 1.5rem",
              background: btnBlueBg,
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Routen
          </button>
        </div>
      </div>

      {/* RECHTS: Routen-Details */}
      <section
        style={{
          gridColumn: "3 / 4",
          gridRow: "2 / 3",
          borderLeft: borderL,
          padding: "1rem",
          backgroundColor: rightBg,
          color: panelText,
          overflowY: "auto",
        }}
      >
        {showRoutes.value && (
          <div style={{ ...panelStyle(darkMode.value), textAlign: "left" }}>
            <RoutesIsland />
          </div>
        )}
      </section>
    </div>
  );
}
