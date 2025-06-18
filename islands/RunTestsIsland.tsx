/** @jsxImportSource preact */
/** islands/RunTestsIsland.tsx */
import { useSignal } from "@preact/signals";

// Panel-Style-Fabrik: weiß im Light, dunkelgrau im Dark
const makePanelStyle = (dark: boolean) => ({
  background: dark ? "#334155" : "#ffffff", // slate-700 vs. white
  borderRadius: "0.75rem",
  padding: "1rem",
  boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.1)",
  marginTop: "1rem",
  width: "100%",
  maxWidth: "28rem",
  textAlign: "center" as const,
});

// Props-Interface mit optionalem Dark-Mode
interface RunTestsProps {
  dark?: boolean;
}

export function RunTestsIsland({ dark = false }: RunTestsProps) {
  const running = useSignal(false);
  const completed = useSignal(false);
  const slackSent = useSignal(false);

  const runTests = async () => {
    running.value = true;
    completed.value = false;
    slackSent.value = false;
    try {
      const res = await fetch("/api/run-tests");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      completed.value = true;
      slackSent.value = true;
    } catch (e) {
      console.error(e);
    } finally {
      running.value = false;
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <button
        type="button"
        onClick={runTests}
        style={{
          padding: "2rem 4rem",
          fontSize: "1.25rem",
          background: "#16a34a",
          color: "#ffffff",
          border: "none",
          borderRadius: "0.75rem",
          cursor: "pointer",
        }}
      >
        {running.value ? "Läuft…" : "Tests starten"}
      </button>

      {(completed.value || slackSent.value) && (
        <div style={makePanelStyle(dark)}>
          {completed.value && (
            <p style={{ margin: "0.5rem 0", color: "#16a34a" }}>
              ✅ Alle Tests abgeschlossen.
            </p>
          )}
          {slackSent.value && (
            <p style={{ margin: "0.5rem 0" }}>
              ✉️ Slack-Testbericht versendet und Blöcke gespeichert.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
