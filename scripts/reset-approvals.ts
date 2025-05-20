// scripts/reset-approvals.ts

import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { resetApprovalsKV } from "../src/api-tester/core/resetApprovals.ts";

await resetApprovalsKV();
