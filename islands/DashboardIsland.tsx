/** @jsxImportSource preact */
/** islands/DashboardIsland.tsx */
import { useSignal } from "@preact/signals";
import { RunTestsIsland } from "./RunTestsIsland.tsx";
import { LastRunIsland } from "./LastRunIsland.tsx";
import { RoutesIsland } from "./RoutesIsland.tsx";

export default function DashboardIsland() {
  const showEndpoints = useSignal(false);
  const showRoutes = useSignal(false);

  const endpoints = useSignal<string[]>([]);
  const loadingE = useSignal(false);
  const errorE = useSignal<string | null>(null);

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

  return (
    <div class="grid grid-cols-3 grid-rows-2 min-h-screen bg-white text-green-700">
      {/* Zeile 1, spanning all */}
      <header class="col-span-3 row-start-1 flex flex-col items-center p-6">
        <img src="/digitalxl-logo.svg" alt="Logo" class="w-32 mb-4" />
        <h1 class="text-4xl font-bold mb-2">API-Tester</h1>
        <p class="text-lg mb-4">
          Letzter Lauf: <LastRunIsland />
        </p>
        <RunTestsIsland />
      </header>

      {/* Zeile 2, Spalte 1 – Endpunkte */}
      <aside class="row-start-2 col-start-1 border-r p-6">
        {showEndpoints.value && (
          <>
            <h2 class="text-2xl font-semibold mb-2">Endpunkte</h2>
            {loadingE.value && <p>Lade…</p>}
            {errorE.value && <p class="text-red-600">{errorE.value}</p>}
            {!loadingE.value && !errorE.value && (
              <ul class="list-disc list-inside space-y-1">
                {endpoints.value.map((ep) => <li key={ep}>{ep}</li>)}
              </ul>
            )}
          </>
        )}
      </aside>

      {/* Zeile 2, Spalte 2 – Buttons */}
      <nav class="row-start-2 col-start-2 flex flex-col items-center justify-start p-6 space-y-4">
        <button
          type="button"
          onClick={loadEndpoints}
          class="px-6 py-3 bg-blue-600 text-white rounded"
        >
          Endpunkte
        </button>
        <button
          type="button"
          onClick={() => {
            showRoutes.value = true;
          }}
          class="px-6 py-3 bg-green-600 text-white rounded"
        >
          Verfügbare Routen
        </button>
      </nav>

      {/* Zeile 2, Spalte 3 – Routen-Details */}
      <section class="row-start-2 col-start-3 border-l p-6">
        {showRoutes.value && (
          <>
            <h2 class="text-2xl font-semibold mb-2">Routen-Details</h2>
            <RoutesIsland />
          </>
        )}
      </section>
    </div>
  );
}
