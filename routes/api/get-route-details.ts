// routes/api/get-route-details.ts

import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(req) {
    const url = new URL(req.url);
    const routeName = url.searchParams.get("name");

    // Prüfe, ob der Routenname angegeben ist
    if (!routeName) {
      return new Response("Route-Name fehlt", { status: 400 });
    }

    try {
      // Routen-Details abrufen
      const routeDetails = getRouteDetails(routeName); // Hier echte Logik einfügen

      // Rückgabe der Routen-Details als JSON
      return new Response(JSON.stringify(routeDetails), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (_err) {
      // Fehlerbehandlung, falls die Route nicht gefunden wird
      return new Response("Route nicht gefunden", { status: 404 });
    }
  },
};

// Beispiel-Funktion, um Routen-Details zu simulieren (durch echte Logik ersetzen)
function getRouteDetails(name: string) {
  // Ersetze diese Dummy-Daten mit tatsächlichen API-Antworten
  if (name === "route1") {
    return {
      name,
      status: "OK",
      data: { key: "value" }, // Beispiel-Daten
    };
  } else {
    // Wenn die Route nicht gefunden wird, einen Fehler werfen
    throw new Error("Route nicht gefunden");
  }
}
