/**
 * `/api/oracle` — live Pyth read against the configured feed, surfaced as JSON.
 *
 * Never returns a fabricated price. If the relay cannot be reached, or the deployment
 * cannot be read, the response is `ok: false` with an actionable `error` string.
 */

import { NextResponse } from "next/server";
import { readOracleSnapshot } from "@/services/oracle";
import { serverEnvironment } from "@/services/env";

export async function GET() {
  const environment = serverEnvironment();
  const result = await readOracleSnapshot(environment.feedId);
  return NextResponse.json(result);
}
