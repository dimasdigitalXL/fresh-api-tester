// routes/api/run-tests.ts

import { Handlers } from "$fresh/server.ts";
import { runAllTests } from "../../run-tests.ts";

export const handler: Handlers = {
  async GET() {
    try {
      await runAllTests();
      return new Response("OK: Tests ausgelöst", { status: 200 });
    } catch (err) {
      console.error("❌ Fehler in runAllTests:", err);
      return new Response("Error", { status: 500 });
    }
  },
};
