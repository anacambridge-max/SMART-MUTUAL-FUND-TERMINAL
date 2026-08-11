import {DEFAULT_SETTINGS} from "@/lib/default-config";
import type {SettingsPayload} from "@/lib/types";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalize(b: Partial<SettingsPayload>): SettingsPayload {
  const strategicWeight = Number(b.strategicWeight ?? DEFAULT_SETTINGS.strategicWeight);
  const navOpportunityWeight = Number(b.navOpportunityWeight ?? DEFAULT_SETTINGS.navOpportunityWeight);

  return {
    marketDataProvider:
      b.marketDataProvider === "manual" || b.marketDataProvider === "zerodha"
        ? b.marketDataProvider
        : "nse",
    strategicWeight: Number.isFinite(strategicWeight) ? strategicWeight : DEFAULT_SETTINGS.strategicWeight,
    navOpportunityWeight: Number.isFinite(navOpportunityWeight)
      ? navOpportunityWeight
      : DEFAULT_SETTINGS.navOpportunityWeight,
    tacticalTopupAmount:
      b.tacticalTopupAmount == null ? null : Number(b.tacticalTopupAmount),
    fundsConfig:
      Array.isArray(b.fundsConfig) && b.fundsConfig.length
        ? b.fundsConfig
        : DEFAULT_SETTINGS.fundsConfig,
  };
}

// Stateless deployment: settings are kept for the current request only.
// This endpoint intentionally has no PostgreSQL dependency.
export async function GET() {
  return NextResponse.json({ok: true, settings: DEFAULT_SETTINGS});
}

export async function PUT(request: Request) {
  try {
    const settings = normalize(await request.json());
    return NextResponse.json({ok: true, settings});
  } catch (error) {
    return NextResponse.json(
      {ok: false, error: error instanceof Error ? error.message : "Failed to update settings"},
      {status: 400},
    );
  }
}
