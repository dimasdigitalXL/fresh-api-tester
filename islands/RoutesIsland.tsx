/** @jsxImportSource preact */
/** islands/RoutesIsland.tsx */
import { useEffect, useState } from "preact/hooks"; // Wir brauchen useState und useEffect

export function RoutesIsland() {
  // Zustände für Routen, ausgewählte Route und Fehlernachricht
  const [routes, setRoutes] = useState<string[]>([]); // Speichert die Routen als Array
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null); // Speichert die ausgewählte Route
  const [error, setError] = useState<string | null>(null); // Speichert Fehlernachrichten, falls das Abrufen der Routen fehlschlägt
  const [loading, setLoading] = useState<boolean>(true); // Zustandsvariable für Ladeanzeige

  // useEffect wird beim Laden der Komponente ausgeführt, um die Routen von der API zu laden
  useEffect(() => {
    // Hier holen wir uns die Routen von der API
    fetch("/api/routes") // URL zum Abrufen der Routen
      .then((response) => {
        if (!response.ok) {
          throw new Error("Fehler beim Laden der Routen");
        }
        return response.json(); // Antwort als JSON parsen
      })
      .then((data) => {
        setRoutes(data.routes || []); // Routen im State speichern
        setLoading(false); // Ladeanzeige deaktivieren
      })
      .catch((err) => {
        setError("Fehler beim Laden der Routen."); // Fehlerbehandlung
        setLoading(false); // Ladeanzeige deaktivieren
        console.error("Fehler beim Laden der Routen:", err);
      });
  }, []); // Diese Effektfunktion wird nur einmal beim Laden der Komponente ausgeführt

  // Funktion, um den aktuellen Status der Route anzuzeigen
  const handleRoute = (routeName: string) => {
    setSelectedRoute(routeName); // Setzt die ausgewählte Route im State
    // Hier könnte man zusätzliche Logik für die Route implementieren, z.B. Details zu dieser Route laden
  };

  return (
    <div>
      <h2>Verfügbare Routen</h2>

      {/* Fehlernachricht anzeigen, falls es einen Fehler beim Abrufen der Routen gab */}
      {error && <p class="text-red-500">{error}</p>}

      {/* Ladeanzeige */}
      {loading && <p class="text-green-500">Lade Routen...</p>}

      {/* Wenn keine Routen gefunden wurden */}
      {routes.length === 0 && !loading && <p>Keine Routen gefunden.</p>}

      <ul class="space-y-4">
        {/* Dynamisch die Routen anzeigen */}
        {routes.map((route) => (
          <li key={route}>
            <button type="button" onClick={() => handleRoute(route)}>
              {route}
            </button>
          </li>
        ))}
      </ul>

      {/* Details zur ausgewählten Route */}
      {selectedRoute && (
        <div class="mt-6 p-4 border rounded bg-gray-50">
          <h3 class="font-bold">Details zu {selectedRoute}</h3>
          <p>Hier können Details für die gewählte Route angezeigt werden.</p>
        </div>
      )}
    </div>
  );
}
