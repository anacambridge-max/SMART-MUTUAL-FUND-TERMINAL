import { DEFAULT_SETTINGS } from "@/lib/default-config";
import type { DashboardPayload, SettingsPayload } from "@/lib/types";

let settings: SettingsPayload = structuredClone(DEFAULT_SETTINGS);
let latestSnapshot: DashboardPayload | null = null;

export async function getOrCreateSettings(): Promise<SettingsPayload> {
  return settings;
}

export async function updateSettings(s: SettingsPayload): Promise<SettingsPayload> {
  const a = Math.max(0, Math.min(100, Math.round(s.strategicWeight)));
  const b = Math.max(0, Math.min(100, Math.round(s.navOpportunityWeight)));
  const total = a + b || 1;
  settings = {
    ...s,
    strategicWeight: Math.round((a / total) * 100),
    navOpportunityWeight: Math.round((b / total) * 100),
    tacticalTopupAmount: s.tacticalTopupAmount == null ? null : Math.max(0, Number(s.tacticalTopupAmount)),
  };
  return settings;
}

export async function getLatestSnapshot(): Promise<DashboardPayload | null> {
  return latestSnapshot;
}

export async function saveSnapshot(payload: DashboardPayload): Promise<void> {
  latestSnapshot = payload;
}
