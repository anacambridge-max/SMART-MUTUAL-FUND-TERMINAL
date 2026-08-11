import { buildDashboardPayload, buildFallbackPayload } from "@/lib/dashboard-engine";
import { DEFAULT_SETTINGS } from "@/lib/default-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const payload = await buildDashboardPayload(DEFAULT_SETTINGS);
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    console.error("Dashboard live engine failed:", error);
    const payload = await buildFallbackPayload(DEFAULT_SETTINGS);
    return NextResponse.json({ ok: true, payload, liveEngineError: true });
  }
}
