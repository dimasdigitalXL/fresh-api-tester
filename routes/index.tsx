// routes/index.tsx
/** @jsxImportSource preact */
import { Head } from "$fresh/runtime.ts";
import DashboardIsland from "../islands/DashboardIsland.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>API-Tester Dashboard</title>
      </Head>
      <main class="w-full h-screen m-0 p-0">
        <DashboardIsland />
      </main>
    </>
  );
}
