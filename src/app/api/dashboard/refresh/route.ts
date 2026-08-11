import {buildDashboardPayload, buildFallbackPayload} from "@/lib/dashboard-engine";
import {buildLiveFundPayload} from "@/lib/live-fund-engine";
import {DEFAULT_SETTINGS} from "@/lib/default-config";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Manual refresh: rebuild the market snapshot and then run the full
    // live 19-fund NAV/scoring engine. No database is required.
    const base = await buildDashboardPayload(DEFAULT_SETTINGS);
    const payload = await buildLiveFundPayload(base);
    return NextResponse.json({ok: true, payload}, {
      headers: {"Cache-Control": "no-store, max-age=0"},
    });
  } catch (error) {
    try {
      const base = await buildFallbackPayload(DEFAULT_SETTINGS);
      return NextResponse.json({
        ok: false,
        error: "Refresh failed. Showing fallback data.",
        payload: base,
        details: error instanceof Error ? error.message : "Unknown error",
      }, {status: 200, headers: {"Cache-Control": "no-store, max-age=0"}});
    } catch {
      return NextResponse.json({ok: false, error: "Refresh failed."}, {status: 500});
    }
  }
}
