import { DEFAULT_FUNDS, TRACKED_INDICES } from "@/lib/default-config";
import type { DashboardPayload, FundComputed, FundConfig, IndexDashboardRow, IndexSnapshot, SettingsPayload } from "@/lib/types";

type AmfiEntry = { schemeCode: string; schemeName: string; nav: number; navDate: string };
type Point = { at: Date; value: number };
type IndexResult = { indices: IndexSnapshot[]; status: "ok" | "fallback" | "unavailable" };

type MfApiResponse = { meta?: { scheme_code?: string; scheme_name?: string }; data?: Array<{ date: string; nav: string }> };

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (a: number | null, b: number | null) => a == null || b == null || a === 0 ? null : ((b - a) / a) * 100;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const parseNavDate = (s: string) => { const [dd, mm, yyyy] = s.split("-"); if (!dd || !mm || !yyyy) return null; return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd))); };
const sma = (p: Point[], n: number) => p.length < n ? null : p.slice(-n).reduce((s, x) => s + x.value, 0) / n;
function before(p: Point[], days: number) { const t = Date.now() - days * 86400000; return [...p].reverse().find(x => x.at.getTime() <= t) || p[0] || null; }

let marketCache: { at: number; result: IndexResult } | null = null;
const historyCache = new Map<string, { at: number; points: Point[] }>();

async function nse(): Promise<IndexResult> {
  if (marketCache && Date.now() - marketCache.at < 10 * 60 * 1000) return marketCache.result;
  try {
    const headers = { "user-agent": "Mozilla/5.0", accept: "application/json,text/plain,*/*", referer: "https://www.nseindia.com/market-data/live-equity-market" };
    const home = await fetch("https://www.nseindia.com", { headers, cache: "no-store" });
    const cookie = (home.headers.get("set-cookie") || "").split(",").map(x => x.split(";")[0]?.trim()).filter(Boolean).join("; ");
    const r = await fetch("https://www.nseindia.com/api/allIndices", { headers: { ...headers, cookie }, cache: "no-store" });
    if (!r.ok) throw new Error("NSE unavailable");
    const j = await r.json() as any;
    const indices = (j.data || []).filter((x: any) => x.index && Number.isFinite(Number(x.last))).map((x: any) => ({ name: String(x.index), value: Number(x.last), changePercent: Number(x.percentChange ?? x.pChange ?? 0) }));
    const result: IndexResult = { indices, status: indices.length ? "ok" : "fallback" };
    marketCache = { at: Date.now(), result };
    return result;
  } catch {
    const result: IndexResult = { indices: [], status: "unavailable" };
    marketCache = { at: Date.now(), result };
    return result;
  }
}

async function amfi(): Promise<{ entries: AmfiEntry[]; status: "ok" | "fallback" | "unavailable" }> {
  try {
    const r = await fetch("https://www.amfiindia.com/spider/getNAVdata.aspx", { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error("AMFI unavailable");
    const entries: AmfiEntry[] = [];
    for (const line of (await r.text()).split(/\r?\n/)) {
      const p = line.split(";");
      if (p.length < 6) continue;
      const nav = Number(p[4]);
      const rawDate = p[5]?.trim();
      if (!p[0] || !p[3] || !Number.isFinite(nav) || !rawDate) continue;
      entries.push({ schemeCode: p[0].trim(), schemeName: p[3].trim(), nav, navDate: rawDate });
    }
    return { entries, status: entries.length ? "ok" : "fallback" };
  } catch {
    return { entries: [], status: "unavailable" };
  }
}

function findFund(entries: AmfiEntry[], fund: FundConfig) {
  if (fund.schemeCode) {
    const exact = entries.find(x => x.schemeCode === fund.schemeCode);
    if (exact) return exact;
  }
  const q = fund.schemeSearch.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.find(x => q.every(word => x.schemeName.toLowerCase().includes(word))) || null;
}

async function mfHistory(code: string): Promise<Point[]> {
  const cached = historyCache.get(code);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.points;
  try {
    const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json() as MfApiResponse;
    const points = (j.data || []).map(x => ({ at: parseNavDate(x.date), value: Number(x.nav) })).filter((x): x is Point => !!x.at && Number.isFinite(x.value)).reverse();
    historyCache.set(code, { at: Date.now(), points });
    return points;
  } catch { return []; }
}

function metrics(p: Point[]) {
  const latest = p.at(-1)?.value ?? null;
  const max52 = Math.max(0, ...p.slice(-252).map(x => x.value));
  const maxAll = Math.max(0, ...p.map(x => x.value));
  const return50 = pct(before(p, 50)?.value ?? null, latest);
  return {
    drawdown52w: latest && max52 ? ((latest - max52) / max52) * 100 : null,
    drawdownAllTime: latest && maxAll ? ((latest - maxAll) / maxAll) * 100 : null,
    return1m: pct(before(p, 30)?.value ?? null, latest),
    return3m: pct(before(p, 90)?.value ?? null, latest),
    return6m: pct(before(p, 180)?.value ?? null, latest),
    sma20: sma(p, 20), sma50: sma(p, 50), sma100: sma(p, 100), sma200: sma(p, 200),
    momentum10d: pct(before(p, 10)?.value ?? null, latest), momentum20d: pct(before(p, 20)?.value ?? null, latest), momentum50d: return50,
    relativeStrengthVsNifty50d: null as number | null,
  };
}

function indexMap(indices: IndexSnapshot[]) { return new Map(indices.map(x => [x.name.toUpperCase(), x])); }
function findIndex(map: Map<string, IndexSnapshot>, name: string) { return map.get(name.toUpperCase()) || null; }
function weighted(exposure: Record<string, number>, map: Map<string, IndexSnapshot>) {
  let sum = 0, weight = 0, count = 0;
  for (const [name, w] of Object.entries(exposure || {})) {
    if (w <= 0) continue;
    const index = findIndex(map, name);
    if (!index) continue;
    sum += index.changePercent * w; weight += w; count++;
  }
  return { move: weight ? sum / weight : 0, count };
}

function score(latest: number | null, sectorMove: number, m: ReturnType<typeof metrics>) {
  const up = !!latest && !!m.sma50 && !!m.sma200 && latest > m.sma50 && m.sma50 > m.sma200;
  const broken = (!!latest && !!m.sma200 && latest < m.sma200 * 0.95) || (!!m.sma50 && !!m.sma200 && m.sma50 < m.sma200 * 0.97) || ((m.return3m ?? 0) < -15);
  const strategic = clamp((up ? 30 : latest && m.sma200 && latest > m.sma200 ? 20 : 10) + clamp(((m.return6m ?? 0) + 15) * 1.1, 0, 25) + clamp(20 - Math.abs(m.drawdownAllTime ?? -20) * 0.3, 0, 20) + clamp(((m.momentum50d ?? 0) + 10) * 0.8, 0, 15));
  const opportunity = clamp(clamp(-sectorMove * 16, 0, 35) + clamp(Math.abs(Math.min(m.drawdown52w ?? 0, 0)) * 1.2, 0, 20) + (broken ? 0 : up ? 20 : 10) + clamp(((m.momentum20d ?? 0) + 8) * 0.8, 0, 15));
  return { strategic, opportunity, sectorScore: clamp(50 - sectorMove * 20), broken };
}

function fallbackFund(f: FundConfig): FundComputed {
  return { id: f.id, name: f.name, schemeCode: f.schemeCode ?? null, proxyIndex: f.proxyIndex, latestNav: null, latestNavDate: null, mappedMove: 0, weightedSectorMove: 0, sectorOpportunityScore: 50, matchedSectorCount: 0, strategicScore: 50, navOpportunityScore: 50, finalDailyScore: 50, classification: "Healthy Correction", actionTag: "SIP", reason: "Live data is temporarily unavailable; no tactical signal is generated.", expectedImpactNote: "Wait for the next successful data refresh.", metrics: { drawdown52w: null, drawdownAllTime: null, return1m: null, return3m: null, return6m: null, sma20: null, sma50: null, sma100: null, sma200: null, momentum10d: null, momentum20d: null, momentum50d: null, relativeStrengthVsNifty50d: null } };
}

function buildIndexDashboard(tracked: IndexSnapshot[]): IndexDashboardRow[] {
  return TRACKED_INDICES.map(name => {
    const i = tracked.find(x => x.name.toUpperCase() === name.toUpperCase()) || { name, value: 0, changePercent: 0 };
    return { name, today: i.changePercent, fiveDay: null, oneMonth: null, threeMonth: null, fiftyTwoWeek: null, dma20: null, dma50: null, dma200: null, trend: i.changePercent > 0.25 ? "UP" : i.changePercent < -0.25 ? "DOWN" : "MIXED" };
  });
}

export async function buildDashboardPayload(settings: SettingsPayload): Promise<DashboardPayload> {
  const [nr, ar] = await Promise.all([nse(), amfi()]);
  const map = indexMap(nr.indices);
  const tracked = TRACKED_INDICES.map(name => findIndex(map, name) || { name, value: 0, changePercent: 0 });
  const fundsWithEntries = settings.fundsConfig.map(f => ({ fund: f, entry: findFund(ar.entries, f) }));
  const historyResults = await Promise.all(fundsWithEntries.map(async x => ({ ...x, points: x.entry ? await mfHistory(x.entry.schemeCode) : [] })));

  const funds: FundComputed[] = historyResults.map(({ fund: f, entry: e, points }) => {
    if (!e) return fallbackFund(f);
    const latest = points.at(-1)?.value ?? e.nav;
    const m = metrics(points);
    const sector = weighted(f.sectorExposure, map);
    const proxy = findIndex(map, f.proxyIndex)?.changePercent ?? 0;
    const s = score(latest, sector.move, m);
    let action: FundComputed["actionTag"] = "SIP";
    let reason = "Long-term trend and current sector conditions do not show a strong tactical edge.";
    let classification: FundComputed["classification"] = "Healthy Correction";
    if (s.broken) { action = "AVOID TODAY"; classification = "Structural Breakdown"; reason = "The fund's medium/long-term trend filter is weak."; }
    else if (sector.move <= -1.75 && s.sectorScore >= 75 && s.strategic >= 55) { action = "STRONG BUY TODAY"; reason = "Relevant sectors are under strong pressure while the fund's structure remains healthy."; }
    else if (sector.move <= -1 && s.sectorScore >= 62) { action = "BUY ON DIP"; reason = "Relevant sectors are weak today and the fund's structure remains supportive."; }
    else if (sector.move <= -0.4 && s.strategic >= 55) { action = "ACCUMULATE"; reason = "Relevant sectors are mildly weak while the medium/long-term structure remains supportive."; }
    else if (sector.move > 0.75 || proxy > 0.75) { action = "WAIT"; reason = "Relevant sectors are strong today, so the tactical dip opportunity is limited."; }
    const final = clamp(0.8 * ((settings.strategicWeight / 100) * s.strategic + (settings.navOpportunityWeight / 100) * s.opportunity) + 0.2 * s.sectorScore);
    return { id: f.id, name: f.name, schemeCode: e.schemeCode, proxyIndex: f.proxyIndex, latestNav: latest, latestNavDate: e.navDate, mappedMove: round(proxy), weightedSectorMove: round(sector.move), sectorOpportunityScore: round(s.sectorScore), matchedSectorCount: sector.count, strategicScore: round(s.strategic), navOpportunityScore: round(s.opportunity), finalDailyScore: round(final), classification, actionTag: action, reason, expectedImpactNote: sector.move < 0 ? "Relevant sector weakness may pressure closing NAV; AMFI publishes NAV end-of-day." : "Relevant sectors are not broadly under pressure today.", metrics: { drawdown52w: m.drawdown52w == null ? null : round(m.drawdown52w), drawdownAllTime: m.drawdownAllTime == null ? null : round(m.drawdownAllTime), return1m: m.return1m == null ? null : round(m.return1m), return3m: m.return3m == null ? null : round(m.return3m), return6m: m.return6m == null ? null : round(m.return6m), sma20: m.sma20, sma50: m.sma50, sma100: m.sma100, sma200: m.sma200, momentum10d: m.momentum10d == null ? null : round(m.momentum10d), momentum20d: m.momentum20d == null ? null : round(m.momentum20d), momentum50d: m.momentum50d == null ? null : round(m.momentum50d), relativeStrengthVsNifty50d: null } };
  });

  const topFunds = [...funds].sort((a, b) => b.finalDailyScore - a.finalDailyScore).slice(0, 5);
  const avoidFunds = funds.filter(f => f.actionTag === "AVOID TODAY");
  const sectorHeatmap = tracked.filter(x => x.value > 0).slice(0, 12);
  const strongestIndices = [...tracked].filter(x => x.value > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const weakestIndices = [...tracked].filter(x => x.value > 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
  const breadth = tracked.length ? tracked.filter(x => x.changePercent > 0).length / tracked.length * 100 : 0;
  const tacticalBase = topFunds.filter(f => f.actionTag.includes("BUY") || f.actionTag === "ACCUMULATE");
  const tacticalAllocation = settings.tacticalTopupAmount && tacticalBase.length ? tacticalBase.map(f => ({ fundId: f.id, fundName: f.name, amount: settings.tacticalTopupAmount! / tacticalBase.length, weightPercent: 100 / tacticalBase.length })) : [];

  return { generatedAt: new Date().toISOString(), settings, sourceStatus: { nse: nr.status, amfi: ar.status, note: "No database is used. Market/index data comes from NSE and fund NAV/history from AMFI/MFAPI." }, marketRegime: { badge: breadth >= 50 ? "RISK ON" : "RISK OFF", color: breadth >= 50 ? "green" : "red", strategyNote: breadth >= 50 ? "Prefer normal SIPs; use tactical top-ups selectively." : "Prefer staggered buying and stronger tactical filters.", breadthPercent: round(breadth, 1) }, headlineIndices: tracked.filter(x => x.value > 0).slice(0, 4), strongestIndices, weakestIndices, sectorHeatmap, indexDashboard: buildIndexDashboard(tracked), funds, topFunds, avoidFunds, tacticalAllocation };
}

export async function buildFallbackPayload(settings: SettingsPayload): Promise<DashboardPayload> {
  const funds = settings.fundsConfig.map(fallbackFund);
  return { generatedAt: new Date().toISOString(), settings, sourceStatus: { nse: "unavailable", amfi: "unavailable", note: "Live providers are unavailable; fallback data is shown." }, marketRegime: { badge: "RISK OFF", color: "red", strategyNote: "Live data unavailable; do not use fallback scores for tactical decisions.", breadthPercent: 0 }, headlineIndices: [], strongestIndices: [], weakestIndices: [], sectorHeatmap: [], indexDashboard: buildIndexDashboard([]), funds, topFunds: funds.slice(0, 5), avoidFunds: [], tacticalAllocation: [] };
}
