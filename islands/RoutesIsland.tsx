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
          r !== "/api/run-tests" &&
          r !== "/api/get-config-endpoints"
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
    <div class="flex flex-col items-center w-full max-w-screen-md mx-auto p-4 text-center my-4">
      <h2 class="text-2xl font-bold mb-4">Verfügbare Routen</h2>
      {loading.value && <p>Lade Routen…</p>}
      {error.value && <p class="text-red-600 mb-4">{error.value}</p>}

      <ul class="list-disc list-inside space-y-2 mb-6 inline-block text-left">
        {routes.value.map((r) => (
          <li key={r}>
            <button
              type="button"
              class="px-3 py-1 bg-gray-100 border rounded hover:bg-gray-200"
              onClick={() => handleRoute(r)}
            >
              {r}
            </button>
          </li>
        ))}
      </ul>

      {selectedRoute.value && (
        // Abstand vor Details
        <div class="flex flex-col items-center text-center w-full mt-8 mb-6">
          <h3 class="text-xl font-semibold mb-2">
            Details zu <code>{selectedRoute.value}</code>
          </h3>

          {loadingDetails.value && <p>Lade Details…</p>}

          {details.value && selectedRoute.value.startsWith("/api/reset-") && (
            <>
              <pre class="bg-gray-50 p-4 rounded overflow-x-auto whitespace-pre-wrap break-all text-left max-w-screen-md mb-2">
                {JSON.stringify(details.value.data, null, 2)}
              </pre>
              <p class="text-green-600">{resetMessage.value}</p>
            </>
          )}

          {details.value && selectedRoute.value === "/api/kv-dump" && (
            <pre class="bg-gray-50 p-4 rounded overflow-x-auto whitespace-pre-wrap break-all text-left max-w-screen-md mb-2">
              {JSON.stringify({ data: details.value.data }, null, 2)}
            </pre>
          )}

          {details.value &&
            !selectedRoute.value.startsWith("/api/reset-") &&
            selectedRoute.value !== "/api/kv-dump" && (
            <pre class="bg-gray-50 p-4 rounded overflow-x-auto whitespace-pre-wrap break-all text-left max-w-screen-md">
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
