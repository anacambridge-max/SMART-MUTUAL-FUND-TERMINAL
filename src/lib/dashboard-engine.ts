import { db } from "@/db";
import { indexHistory, navHistory } from "@/db/schema";
import { TRACKED_INDICES } from "@/lib/default-config";
import type { DashboardPayload, FundComputed, IndexDashboardRow, IndexSnapshot, SettingsPayload, TacticalAllocation } from "@/lib/types";
import { and, asc, gte, inArray, sql } from "drizzle-orm";

type AmfiEntry = { schemeCode: string; schemeName: string; nav: number; navDate: string };
type Point = { at: Date; value: number };

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const pct = (a: number | null, b: number | null) => a == null || b == null || a === 0 ? null : (b - a) / a * 100;
const sma = (p: Point[], n: number) => p.length < n ? null : p.slice(-n).reduce((s, x) => s + x.value, 0) / n;

function before(p: Point[], days: number) {
  const t = Date.now() - days * 86400000;
  return [...p].reverse().find(x => x.at.getTime() <= t) || p[0] || null;
}

function parseDate(s: string) {
  const [dd, mm, yy] = s.trim().split("-");
  const months: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  if (!dd || !mm || months[mm.toUpperCase()] === undefined || !yy) return null;
  return dateKey(new Date(Date.UTC(Number(yy), months[mm.toUpperCase()], Number(dd))));
}

async function nse(): Promise<{ indices: IndexSnapshot[]; status: "ok" | "fallback" | "unavailable" }> {
  try {
    const h = { "user-agent": "Mozilla/5.0", accept: "application/json,text/plain,*/*", referer: "https://www.nseindia.com/market-data/live-equity-market" };
    const a = await fetch("https://www.nseindia.com", { headers: h, cache: "no-store" });
    const cookie = (a.headers.get("set-cookie") || "").split(",").map(x => x.split(";")[0]?.trim()).filter(Boolean).join("; ");
    const r = await fetch("https://www.nseindia.com/api/allIndices", { headers: { ...h, cookie }, cache: "no-store" });
    if (!r.ok) return { indices: [], status: "fallback" };
    const j = await r.json() as any;
    const indices = (j.data || []).filter((x: any) => x.index && Number.isFinite(Number(x.last))).map((x: any) => ({
      name: String(x.index), value: Number(x.last), changePercent: Number(x.percentChange ?? x.pChange ?? 0)
    }));
    return { indices, status: indices.length ? "ok" : "fallback" };
  } catch {
    return { indices: [], status: "unavailable" };
  }
}

async function sensex() {
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN?interval=1d&range=5d", { cache: "no-store" });
    const m = (await r.json() as any).chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice || !m?.chartPreviousClose) return null;
    return { name: "SENSEX", value: Number(m.regularMarketPrice), changePercent: (m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose * 100 };
  } catch { return null; }
}

async function amfi(): Promise<{ entries: AmfiEntry[]; status: "ok" | "fallback" | "unavailable" }> {
  try {
    const r = await fetch("https://www.amfiindia.com/spider/getNAVdata.aspx", { cache: "no-store", headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return { entries: [], status: "fallback" };
    const entries: AmfiEntry[] = [];
    for (const line of (await r.text()).split(/\r?\n/)) {
      const p = line.split(";");
      if (p.length < 6) continue;
      const d = parseDate(p[5] || "");
      const nav = Number(p[4]);
      if (p[0] && p[3] && Number.isFinite(nav) && d) entries.push({ schemeCode: p[0].trim(), schemeName: p[3].trim(), nav, navDate: d });
    }
    return { entries, status: entries.length ? "ok" : "fallback" };
  } catch {
    return { entries: [], status: "unavailable" };
  }
}

function findIndex(m: Map<string, IndexSnapshot>, name: string) {
  return m.get(name) || [...m.values()].find(v => v.name.toUpperCase() === name.toUpperCase()) || null;
}
function findFund(e: AmfiEntry[], code: string | undefined, search: string) {
  return (code && e.find(x => x.schemeCode === code)) || e.find(x => x.schemeName.toLowerCase().includes(search.toLowerCase())) || null;
}
function metrics(p: Point[], nifty: number | null) {
  const latest = p.at(-1)?.value ?? null;
  const max52 = Math.max(0, ...p.slice(-252).map(x => x.value));
  const maxAll = Math.max(0, ...p.map(x => x.value));
  const r50 = pct(before(p, 50)?.value ?? null, latest);
  return {
    drawdown52w: latest && max52 ? (latest - max52) / max52 * 100 : null,
    drawdownAllTime: latest && maxAll ? (latest - maxAll) / maxAll * 100 : null,
    return1m: pct(before(p, 30)?.value ?? null, latest), return3m: pct(before(p, 90)?.value ?? null, latest), return6m: pct(before(p, 180)?.value ?? null, latest),
    sma20: sma(p, 20), sma50: sma(p, 50), sma100: sma(p, 100), sma200: sma(p, 200),
    momentum10d: pct(before(p, 10)?.value ?? null, latest), momentum20d: pct(before(p, 20)?.value ?? null, latest), momentum50d: r50,
    relativeStrengthVsNifty50d: r50 == null || nifty == null ? null : r50 - nifty
  };
}
function weighted(exposure: Record<string, number>, m: Map<string, IndexSnapshot>) {
  let sum = 0, w = 0, count = 0;
  for (const [k, v] of Object.entries(exposure || {})) {
    if (v <= 0) continue;
    const i = findIndex(m, k);
    if (!i) continue;
    sum += i.changePercent * v; w += v; count++;
  }
  return { move: w ? sum / w : 0, count };
}
function scores(latest: number | null, proxy: number, sector: number, m: ReturnType<typeof metrics>) {
  const up = !!latest && !!m.sma50 && !!m.sma200 && latest > m.sma50 && m.sma50 > m.sma200;
  const broken = (!!latest && !!m.sma200 && latest < m.sma200 * .95) || (!!m.sma50 && !!m.sma200 && m.sma50 < m.sma200 * .97) || ((m.return3m ?? 0) < -15);
  const strategic = clamp((up ? 30 : latest && m.sma200 && latest > m.sma200 ? 20 : 10) + clamp(((m.return6m ?? 0) + 15) * 1.1, 0, 25) + clamp(20 - Math.abs(m.drawdownAllTime ?? -20) * .3, 0, 20) + clamp(((m.momentum50d ?? 0) + 10) * .8, 0, 15) + clamp(((m.relativeStrengthVsNifty50d ?? 0) + 8) * .7, 0, 10));
  const opp = clamp(clamp(-sector * 16, 0, 35) + clamp(-proxy * 4, 0, 10) + clamp(Math.abs(Math.min(m.drawdown52w ?? 0, 0)) * 1.2, 0, 20) + (broken ? 0 : up ? 20 : 10) + clamp(((m.momentum20d ?? 0) + 8) * .8, 0, 15) + clamp(((m.relativeStrengthVsNifty50d ?? 0) + 8) * .6, 0, 10));
  return { strategic, opp, sectorScore: clamp(50 - sector * 20), broken };
}

export async function buildDashboardPayload(settings: SettingsPayload): Promise<DashboardPayload> {
  const [nr, ar] = await Promise.all([nse(), amfi()]);
  const map = new Map(nr.indices.map(x => [x.name, x]));
  if (!findIndex(map, "SENSEX")) { const s = await sensex(); if (s) map.set("SENSEX", s); }
  const tracked = TRACKED_INDICES.map(name => findIndex(map, name) || { name, value: 0, changePercent: 0 });
  const today = dateKey(new Date());
  const live = tracked.filter(x => x.value > 0);
  if (live.length) await db.insert(indexHistory).values(live.map(x => ({ indexName: x.name, indexValue: String(x.value), changePercent: String(x.changePercent), tradingDate: today }))).onConflictDoUpdate({ target: [indexHistory.indexName, indexHistory.tradingDate], set: { indexValue: sql.raw("excluded.index_value"), changePercent: sql.raw("excluded.change_percent"), recordedAt: new Date() } });
  const rows = await db.select({ name: indexHistory.indexName, value: indexHistory.indexValue, date: indexHistory.tradingDate }).from(indexHistory).where(and(inArray(indexHistory.indexName, TRACKED_INDICES), gte(indexHistory.tradingDate, dateKey(new Date(Date.now() - 420 * 86400000))))).orderBy(asc(indexHistory.tradingDate));
  const series = new Map<string, Point[]>();
  for (const r of rows) { const a = series.get(r.name) || []; a.push({ at: new Date(`${r.date}T00:00:00Z`), value: Number(r.value) }); series.set(r.name, a); }
  const indexDashboard: IndexDashboardRow[] = tracked.map(i => {
    const p = series.get(i.name) || []; const q = i.value ? [...p, { at: new Date(), value: i.value }] : p; const latest = q.at(-1)?.value ?? null;
    const d20 = sma(q, 20), d50 = sma(q, 50), d200 = sma(q, 200);
    return { name: i.name, today: i.changePercent, fiveDay: pct(before(q, 5)?.value ?? null, latest), oneMonth: pct(before(q, 30)?.value ?? null, latest), threeMonth: pct(before(q, 90)?.value ?? null, latest), fiftyTwoWeek: pct(before(q, 365)?.value ?? null, latest), dma20: d20, dma50: d50, dma200: d200, trend: latest && d50 && d200 ? (latest > d50 && d50 > d200 ? "UP" : latest < d50 && d50 < d200 ? "DOWN" : "MIXED") : "MIXED" };
  });
  const nifty = pct(before(series.get("NIFTY 50") || [], 50)?.value ?? null, (series.get("NIFTY 50") || []).at(-1)?.value ?? null);
  const matches = settings.fundsConfig.map(f => ({ fund: f, entry: findFund(ar.entries, f.schemeCode, f.schemeSearch) })).filter((x): x is { fund: SettingsPayload["fundsConfig"][number]; entry: AmfiEntry } => !!x.entry);
  if (matches.length) await db.insert(navHistory).values(matches.map(x => ({ schemeCode: x.entry.schemeCode, schemeName: x.entry.schemeName, nav: String(x.entry.nav), navDate: x.entry.navDate }))).onConflictDoNothing();
  const codes = [...new Set(matches.map(x => x.entry.schemeCode))];
  const navRows = codes.length ? await db.select({ code: navHistory.schemeCode, nav: navHistory.nav, date: navHistory.navDate }).from(navHistory).where(inArray(navHistory.schemeCode, codes)).orderBy(asc(navHistory.navDate)) : [];
  const navSeries = new Map<string, Point[]>();
  for (const r of navRows) { const a = navSeries.get(r.code) || []; a.push({ at: new Date(`${r.date}T00:00:00Z`), value: Number(r.nav) }); navSeries.set(r.code, a); }
  const funds: FundComputed[] = settings.fundsConfig.map(f => {
    const e = matches.find(x => x.fund.id === f.id)?.entry || null; const p = e ? navSeries.get(e.schemeCode) || [] : []; const latest = p.at(-1)?.value ?? null;
    const m = metrics(p, nifty); const proxy = findIndex(map, f.proxyIndex)?.changePercent ?? 0; const sec = weighted(f.sectorExposure, map); const s = scores(latest, proxy, sec.move, m);
    let action: FundComputed["actionTag"] = "SIP", reason = "Trend appears intact with normal volatility."; let classification: FundComputed["classification"] = "Healthy Correction";
    if (!e) reason = "Scheme was not matched in the latest AMFI feed; no tactical signal is generated.";
    else if (s.broken) { classification = "Structural Breakdown"; action = "AVOID TODAY"; reason = "Trend filter violation or weak medium-term structure."; }
    else if (sec.move <= -1.75 && s.sectorScore >= 75 && s.strategic >= 55) { action = "STRONG BUY TODAY"; reason = "Weighted sectors are under strong pressure while fund structure remains healthy."; }
    else if (sec.move <= -1 && s.sectorScore >= 62) { action = "BUY ON DIP"; reason = "Relevant sectors are weak today and structural filters remain supportive."; }
    else if (sec.move <= -.4 && s.strategic >= 55) { action = "ACCUMULATE"; reason = "Relevant sectors are mildly weak and medium/long-term structure remains supportive."; }
    else if (sec.move > .75 || proxy > .75) { action = "WAIT"; reason = "Relevant sectors are strong today; tactical dip opportunity is limited."; }
    let final = .8 * ((settings.strategicWeight / 100) * s.strategic + (settings.navOpportunityWeight / 100) * s.opp) + .2 * s.sectorScore;
    if (s.broken) final = Math.min(final, 35);
    return { id: f.id, name: f.name, schemeCode: e?.schemeCode ?? null, proxyIndex: f.proxyIndex, latestNav: latest, latestNavDate: e?.navDate ?? null, mappedMove: round(proxy), weightedSectorMove: round(sec.move), sectorOpportunityScore: round(s.sectorScore), matchedSectorCount: sec.count, strategicScore: round(s.strategic), navOpportunityScore: round(s.opp), finalDailyScore: round(final), classification, actionTag: action, reason, expectedImpactNote: sec.move < 0 ? "Relevant sector weakness may pressure closing NAV; AMFI publishes NAV end-of-day." : "Sector basket is not under broad pressure today.", metrics: { drawdown52w: m.drawdown52w == null ? null : round(m.drawdown52w), drawdownAllTime: m.drawdownAllTime == null ? null : round(m.drawdownAllTime), return1m: m.return1m == null ? null : round(m.return1m), return3m: m.return3m == null ? null : round(m.return3m), return6m: m.return6m == null ? null : round(m.return6m), sma20: m.sma20 == null ? null : round(m.sma20, 3), sma50: m.sma50 == null ? null : round(m.sma50, 3), sma100: m.sma100 == null ? null : round(m.sma100, 3), sma200: m.sma200 == null ? null : round(m.sma200, 3), momentum10d: m.momentum10d == null ? null : round(m.momentum10d), momentum20d: m.momentum20d == null ? null : round(m.momentum20d), momentum50d: m.momentum50d == null ? null : round(m.momentum50d), relativeStrengthVsNifty50d: m.relativeStrengthVsNifty50d == null ? null : round(m.relativeStrengthVsNifty50d) } };
  });
  const topFunds = funds.filter(f => f.classification !== "Structural Breakdown").sort((a, b) => b.finalDailyScore - a.finalDailyScore).slice(0, 5);
  const tacticalAllocation: TacticalAllocation[] = [];
  if (settings.tacticalTopupAmount && topFunds.length) {
    const total = topFunds.reduce((s, f) => s + Math.max(1, f.finalDailyScore), 0);
    for (const f of topFunds) { const w = Math.max(1, f.finalDailyScore) / total * 100; tacticalAllocation.push({ fundId: f.id, fundName: f.name, weightPercent: round(w), amount: round(settings.tacticalTopupAmount * w / 100, 0) }); }
  }
  const sectors = TRACKED_INDICES.filter(x => x.startsWith("NIFTY ") && !x.includes("50") && !x.includes("NEXT") && !x.includes("MIDCAP") && !x.includes("SMALLCAP"));
  const sectorHeatmap = sectors.map(x => findIndex(map, x)).filter((x): x is IndexSnapshot => !!x);
  const breadth = sectorHeatmap.length ? sectorHeatmap.filter(x => x.changePercent > 0).length / sectorHeatmap.length * 100 : 0;
  const majors = indexDashboard.filter(x => ["NIFTY 50", "NIFTY MIDCAP 150", "NIFTY SMALLCAP 250"].includes(x.name));
  const riskOn = majors.filter(x => x.trend === "UP").length >= 2 && breadth >= 50;
  return { generatedAt: new Date().toISOString(), settings, sourceStatus: { nse: nr.status, amfi: ar.status, note: "NSE live index feed + AMFI NAV feed. Mutual-fund NAV is end-of-day; intraday scores are opportunity estimates." }, marketRegime: { badge: riskOn ? "RISK ON" : "RISK OFF", color: riskOn ? "green" : "red", strategyNote: riskOn ? "Continue core SIP and deploy corrections selectively." : "Continue core SIP, reduce tactical allocation and avoid chasing strength.", breadthPercent: round(breadth) }, headlineIndices: ["NIFTY 50", "SENSEX", "NIFTY MIDCAP 150", "NIFTY SMALLCAP 250"].map(x => findIndex(map, x)).filter((x): x is IndexSnapshot => !!x), strongestIndices: [...tracked].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3), weakestIndices: [...tracked].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5), sectorHeatmap, indexDashboard, funds, topFunds, avoidFunds: funds.filter(f => f.classification === "Structural Breakdown"), tacticalAllocation };
}

export function buildFallbackPayload(settings: SettingsPayload): DashboardPayload {
  const funds: FundComputed[] = settings.fundsConfig.map(f => ({ id: f.id, name: f.name, schemeCode: f.schemeCode ?? null, proxyIndex: f.proxyIndex, latestNav: null, latestNavDate: null, mappedMove: 0, weightedSectorMove: 0, sectorOpportunityScore: 50, matchedSectorCount: 0, strategicScore: 50, navOpportunityScore: 50, finalDailyScore: 50, classification: "Healthy Correction", actionTag: "SIP", reason: "Live market data is unavailable; continue the configured SIP rather than making a tactical call.", expectedImpactNote: "No live index or NAV estimate is available.", metrics: { drawdown52w: null, drawdownAllTime: null, return1m: null, return3m: null, return6m: null, sma20: null, sma50: null, sma100: null, sma200: null, momentum10d: null, momentum20d: null, momentum50d: null, relativeStrengthVsNifty50d: null } }));
  return { generatedAt: new Date().toISOString(), settings, sourceStatus: { nse: "unavailable", amfi: "unavailable", note: "Live providers are unavailable. Safe fallback; no market data is invented." }, marketRegime: { badge: "RISK OFF", color: "red", strategyNote: "Continue core SIP and wait for live data before tactical deployment.", breadthPercent: 0 }, headlineIndices: [], strongestIndices: [], weakestIndices: [], sectorHeatmap: [], indexDashboard: [], funds, topFunds: funds.slice(0, 5), avoidFunds: [], tacticalAllocation: [] };
}
