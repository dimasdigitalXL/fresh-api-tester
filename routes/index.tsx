/** @jsxImportSource preact */
/** routes/index.tsx */
import { Head } from "$fresh/runtime.ts";
import DashboardIsland from "../islands/DashboardIsland.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>API-Tester Dashboard</title>
      </Head>
      <DashboardIsland />
    </>
  );
}
