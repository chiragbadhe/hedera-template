import { NextResponse } from "next/server";
import { publicEnvironment } from "@/services/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ public: publicEnvironment() });
}
