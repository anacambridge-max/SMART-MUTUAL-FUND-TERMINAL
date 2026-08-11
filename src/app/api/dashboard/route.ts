import {buildFallbackPayload} from "@/lib/dashboard-engine";
import {DEFAULT_SETTINGS} from "@/lib/default-config";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Stateless deployment: no database is required.
  // The dashboard starts from the built-in configuration and fallback engine.
  const payload = await buildFallbackPayload(DEFAULT_SETTINGS);
  return NextResponse.json({ok: true, payload});
}
