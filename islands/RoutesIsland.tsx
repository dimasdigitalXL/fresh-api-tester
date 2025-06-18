/** @jsxImportSource preact */
/** islands/RoutesIsland.tsx */
import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface RouteDetails {
  name: string;
  status: "OK" | "ERROR";
  statusCode: number;
  durationMs: number;
  data: Record<string, unknown>;
}

export function RoutesIsland() {
  const routes = useSignal<string[]>([]);
  const selectedRoute = useSignal<string | null>(null);
  const details = useSignal<RouteDetails | null>(null);
  const error = useSignal<string | null>(null);
  const loading = useSignal(true);
  const loadingDetails = useSignal(false);
  const resetMessage = useSignal<string>("");

  useEffect(() => {
    fetch("/api/get-routes")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { routes: string[] }) => {
        routes.value = d.routes.filter((r) =>
          r !== "/api/run-tests" && r !== "/api/get-config-endpoints"
        );
      })
      .catch(() => {
        error.value = "Fehler beim Laden der Routen.";
      })
      .finally(() => {
        loading.value = false;
      });
  }, []);

  const handleRoute = (route: string) => {
    selectedRoute.value = route;
    details.value = null;
    error.value = null;
    resetMessage.value = "";
    loadingDetails.value = true;

    fetch(`/api/get-route-details?name=${encodeURIComponent(route)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: RouteDetails) => {
        details.value = d;
        if (route.startsWith("/api/reset-")) {
          resetMessage.value = `✅ Alle ${
            route.replace("/api/reset-", "")
          } in KV zurückgesetzt.`;
        }
      })
      .catch(() => {
        error.value = "Fehler beim Laden der Details.";
      })
      .finally(() => {
        loadingDetails.value = false;
      });
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "768px",
        margin: "1rem auto",
        textAlign: "center",
      }}
    >
      <h2
        style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}
      >
        Routen
      </h2>
      {loading.value && <p>Lade Routen…</p>}
      {error.value && <p style={{ color: "red" }}>{error.value}</p>}

      <ul style={{ listStyle: "none", padding: 0, marginBottom: "1.5rem" }}>
        {routes.value.map((r) => {
          const label = r.replace(/^\/api\//, "");
          return (
            <li key={r} style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => handleRoute(r)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      {selectedRoute.value && (
        <div style={{ textAlign: "left" }}>
          <h3
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
            }}
          >
            Details zu <code>{selectedRoute.value}</code>
          </h3>

          {loadingDetails.value && <p>Lade Details…</p>}

          {details.value && selectedRoute.value.startsWith("/api/reset-") && (
            <>
              <pre
                style={{
                  background: "#000000",
                  color: "#ffffff",
                  padding: "1rem",
                  borderRadius: "0.375rem",
                  overflowX: "auto",
                  marginBottom: "0.5rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(details.value.data, null, 2)}
              </pre>
              <p style={{ color: "green" }}>{resetMessage.value}</p>
            </>
          )}

          {details.value && selectedRoute.value === "/api/kv-dump" && (
            <pre
              style={{
                background: "#000000",
                color: "#ffffff",
                padding: "1rem",
                borderRadius: "0.375rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify({ data: details.value.data }, null, 2)}
            </pre>
          )}

          {details.value &&
            !selectedRoute.value.startsWith("/api/reset-") &&
            selectedRoute.value !== "/api/kv-dump" && (
            <pre
              style={{
                background: "#000000",
                color: "#ffffff",
                padding: "1rem",
                borderRadius: "0.375rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(details.value, null, 2)}
            </pre>
          )}

          {!loadingDetails.value && !details.value && (
            <p>Keine Details verfügbar.</p>
          )}
        </div>
      )}
    </div>
  );
}
