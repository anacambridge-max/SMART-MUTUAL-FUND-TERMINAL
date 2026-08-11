import {buildDashboardPayload, buildFallbackPayload} from "@/lib/dashboard-engine";
import {DEFAULT_SETTINGS} from "@/lib/default-config";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Stateless refresh: fetch fresh market/NAV data when available,
    // without requiring PostgreSQL persistence.
    const payload = await buildDashboardPayload(DEFAULT_SETTINGS);
    return NextResponse.json({ok: true, payload});
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "Refresh failed. Showing built-in fallback data.",
      payload: await buildFallbackPayload(DEFAULT_SETTINGS),
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
