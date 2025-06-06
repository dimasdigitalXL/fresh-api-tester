/** @jsxImportSource preact */
/** routes/index.tsx */
import SlackDebugEventsIsland from "../islands/SlackDebugEventsIsland.tsx";
import { LastRunIsland } from "../islands/LastRunIsland.tsx";
import { RoutesIsland } from "../islands/RoutesIsland.tsx"; // Ein Island für die Routen

export default function Home() {
  return (
    <div class="flex flex-col items-center justify-center min-h-screen bg-white text-green-700 p-6">
      <img
        src="/digitalxl-logo.svg"
        alt="digitalXL Logo"
        class="w-32 h-auto mb-6"
      />
      <h1 class="text-4xl font-bold mb-2">digitalXL API-Tester</h1>

      {/* Letzter Cron-Job (Island) */}
      <p class="mb-6 text-green-600">
        Letzter Cron-Job-Lauf: <LastRunIsland />
      </p>

      {/* Verfügbare Routen (Island) */}
      <div class="w-full max-w-xl">
        <RoutesIsland />
      </div>

      {/* Slack Debug Events (Island) */}
      <SlackDebugEventsIsland />
    </div>
  );
}
