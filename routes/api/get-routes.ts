// routes/api/get-routes.ts

import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(req) {
    try {
      const url = new URL(req.url);
      const routeName = url.searchParams.get("name");

      // Überprüfe, ob der Routenname vorhanden ist
      if (!routeName) {
        return new Response("Route-Name fehlt", { status: 400 });
      }

      // Routen-Details abrufen
      const routeDetails = getRouteDetails(routeName); // Hier keine await erforderlich

      // Antwort mit den Routen-Details
      return new Response(JSON.stringify(routeDetails), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Fehlerbehandlung, falls etwas schief geht
      console.error("Fehler beim Abrufen der Routen-Details:", err);
      return new Response("Interner Serverfehler", { status: 500 });
    }
  },
};

// Beispiel-Funktion, um Routen-Details zu simulieren (diese sollte durch echte Logik ersetzt werden)
function getRouteDetails(name: string) {
  // Hier solltest du die tatsächlichen Routen-Details aus deiner Datenquelle abrufen
  // Diese Funktion gibt momentan Dummy-Daten zurück
  if (name === "test-route") {
    return {
      name,
      status: "OK",
      data: { key: "value" }, // Dummy-Daten
    };
  } else {
    // Beispiel für eine nicht gefundene Route
    throw new Error("Route nicht gefunden");
  }
}
