import { buildDashboardPayload, buildFallbackPayload } from "@/lib/dashboard-engine";
import { buildLiveFundPayload } from "@/lib/live-fund-engine";
import { DEFAULT_SETTINGS } from "@/lib/default-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const base = await buildDashboardPayload(DEFAULT_SETTINGS);
    const payload = await buildLiveFundPayload(base);
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    console.error("Dashboard live engine failed:", error);
    const payload = await buildFallbackPayload(DEFAULT_SETTINGS);
    return NextResponse.json({ ok: true, payload, liveEngineError: true });
  }
}
