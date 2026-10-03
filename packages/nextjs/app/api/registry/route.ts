/**
 * `/api/registry` — current policy and the most recent records, so the dashboard does
 * not need to make ten parallel calls. The heavy reads are done on the server and
 * served as a single, cachable response.
 */

import { NextResponse } from "next/server";
import { readRecentRecords, readRegistryPolicy } from "@/services/oracle";

export const dynamic = "force-dynamic";

export async function GET() {
  const [policy, records] = await Promise.all([readRegistryPolicy(), readRecentRecords(50)]);

  return NextResponse.json({
    policy: policy.ok ? policy.value : null,
    policyError: policy.ok ? null : policy.error,
    records: records.ok ? records.value : [],
    recordsError: records.ok ? null : records.error,
  });
}
