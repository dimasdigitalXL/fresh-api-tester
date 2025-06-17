/** @jsxImportSource preact */
/** islands/DashboardIsland.tsx */
import { useSignal } from "@preact/signals";
import { RunTestsIsland } from "./RunTestsIsland.tsx";
import { LastRunIsland } from "./LastRunIsland.tsx";
import { RoutesIsland } from "./RoutesIsland.tsx";

export default function DashboardIsland() {
  // current view: none | endpoints | routes
  const view = useSignal<"none" | "endpoints" | "routes">("none");

  // State für Endpunkte
  const endpoints = useSignal<string[]>([]);
  const loadingE = useSignal(false);
  const errorE = useSignal<string | null>(null);

  // Lädt die Endpunkte
  const loadEndpoints = async () => {
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

  return (
    <div class="grid grid-cols-1 lg:grid-cols-3 min-h-screen bg-white text-green-700 p-6 gap-6">
      {/* Linke Spalte */}
      <div class="hidden lg:block">
        {view.value === "endpoints" && (
          <section class="space-y-4">
            <h2 class="text-2xl font-semibold">Endpunkte</h2>
            {loadingE.value && <p>Lade Endpunkte…</p>}
            {errorE.value && <p class="text-red-600">{errorE.value}</p>}
            {!loadingE.value && !errorE.value && (
              <ul class="list-disc list-inside space-y-1">
                {endpoints.value.map((ep) => (
                  <li key={ep} class="text-lg">{ep}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Mittlere Spalte */}
      <div class="flex flex-col items-center text-center space-y-6">
        <img
          src="/digitalxl-logo.svg"
          alt="digitalXL Logo"
          class="w-32 h-auto"
        />
        <h1 class="text-4xl font-bold">API-Tester</h1>
        <p class="text-lg">
          Letzter Lauf: <LastRunIsland />
        </p>

        <RunTestsIsland />

        <div class="flex flex-col w-full max-w-xs space-y-4">
          <button
            type="button"
            onClick={() => {
              view.value = "endpoints";
              loadEndpoints();
            }}
            class="px-8 py-4 text-2xl bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
          >
            Endpunkte
          </button>

          <button
            type="button"
            onClick={() => {
              view.value = "routes";
            }}
            class="px-8 py-4 text-2xl bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
          >
            Verfügbare Routen
          </button>
        </div>
      </div>

      {/* Rechte Spalte */}
      <div class="hidden lg:block">
        {view.value === "routes" && (
          <section>
            <RoutesIsland />
          </section>
        )}
      </div>
    </div>
  );
}
