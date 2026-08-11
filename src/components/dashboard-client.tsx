"use client";
import type { DashboardPayload, FundConfig, SettingsPayload } from "@/lib/types";
import { useEffect, useState } from "react";

const pct = (v: number | null | undefined) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number) => v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-amber-300";

export default function DashboardClient({ initialPayload, initialSettings }: { initialPayload: DashboardPayload; initialSettings: SettingsPayload }) {
  const [payload, setPayload] = useState(initialPayload);
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/dashboard/refresh", { cache: "no-store" });
      const j = await r.json(); setPayload(j.payload); if (!j.ok) setError(j.error || "Refresh failed");
    } catch { setError("Provider unavailable; showing last snapshot."); }
    finally { setBusy(false); }
  };

  useEffect(() => { const id = window.setInterval(refresh, 15 * 60 * 1000); return () => window.clearInterval(id); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const j = await r.json(); if (!j.ok) throw new Error(j.error); setSettings(j.settings); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Settings save failed"); }
    finally { setBusy(false); }
  };

  const updateFund = (id: string, patch: Partial<FundConfig>) => setSettings(s => ({ ...s, fundsConfig: s.fundsConfig.map(f => f.id === id ? { ...f, ...patch } : f) }));

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
    <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Smart MF Daily Decision Terminal</h1><p className="mt-1 text-xs text-slate-400">Updated {new Date(payload.generatedAt).toLocaleString("en-IN")} · NSE {payload.sourceStatus.nse} · AMFI {payload.sourceStatus.amfi}</p></div><button onClick={refresh} disabled={busy} className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950">{busy ? "Refreshing…" : "Refresh Now"}</button></div>{error && <p className="mt-3 rounded bg-rose-950 p-2 text-sm text-rose-200">{error}</p>}<p className="mt-3 text-xs text-amber-300">Mutual-fund NAV is end-of-day. Intraday scores estimate potential closing-NAV opportunity; they are not live NAVs.</p></header>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-bold ${payload.marketRegime.color === "green" ? "bg-emerald-900 text-emerald-200" : "bg-rose-900 text-rose-200"}`}>{payload.marketRegime.badge}</span><span className="text-sm">Sector breadth: {payload.marketRegime.breadthPercent.toFixed(1)}%</span><span className="text-sm text-slate-400">{payload.marketRegime.strategyNote}</span></div></section>
    <section className="grid gap-3 md:grid-cols-4">{payload.headlineIndices.map(i => <div key={i.name} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">{i.name}</p><p className="text-xl font-bold">{i.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p><p className={`text-sm ${tone(i.changePercent)}`}>{pct(i.changePercent)}</p></div>)}</section>
    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">🔥 Top 5 MF Opportunities</h2><div className="mt-3 space-y-3">{payload.topFunds.map(f => <article key={f.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3"><div className="flex justify-between gap-3"><div><p className="font-semibold">{f.name}</p><p className="text-xs text-slate-400">{f.actionTag} · Score {f.finalDailyScore}/100</p></div><span className="rounded bg-cyan-950 px-2 py-1 text-cyan-200">Sector {f.sectorOpportunityScore}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300"><span>Weighted sector move: <b className={tone(f.weightedSectorMove)}>{pct(f.weightedSectorMove)}</b></span><span>Fund NAV: {f.latestNav ?? "—"}</span><span>52W drawdown: {pct(f.metrics.drawdown52w)}</span><span>RS vs Nifty: {pct(f.metrics.relativeStrengthVsNifty50d)}</span></div><p className="mt-2 text-xs text-slate-300">{f.reason}</p></article>)}</div></div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">📉 Sector Heatmap</h2><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">{payload.sectorHeatmap.map(s => <div key={s.name} className="rounded-lg bg-slate-800 p-3"><p className="text-xs text-slate-400">{s.name}</p><p className={`font-semibold ${tone(s.changePercent)}`}>{pct(s.changePercent)}</p></div>)}</div><h2 className="mt-5 font-semibold">⚠️ Avoid Today</h2><div className="mt-2 space-y-2">{payload.avoidFunds.length ? payload.avoidFunds.map(f => <div key={f.id} className="rounded bg-rose-950/40 p-2 text-sm"><b>{f.name}</b> — {f.reason}</div>) : <p className="text-sm text-slate-400">No structural breakdown flags.</p>}</div></div></section>
    <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">Index Trend Dashboard</h2><table className="mt-3 min-w-full text-xs"><thead className="text-slate-400"><tr>{["Index", "Today", "5D", "1M", "3M", "52W", "20DMA", "50DMA", "200DMA", "Trend"].map(x => <th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>{payload.indexDashboard.map(r => <tr key={r.name} className="border-t border-slate-800"><td className="p-2">{r.name}</td><td className={`p-2 ${tone(r.today)}`}>{pct(r.today)}</td><td className="p-2">{pct(r.fiveDay)}</td><td className="p-2">{pct(r.oneMonth)}</td><td className="p-2">{pct(r.threeMonth)}</td><td className="p-2">{pct(r.fiftyTwoWeek)}</td><td className="p-2">{r.dma20?.toFixed(1) ?? "—"}</td><td className="p-2">{r.dma50?.toFixed(1) ?? "—"}</td><td className="p-2">{r.dma200?.toFixed(1) ?? "—"}</td><td className="p-2">{r.trend}</td></tr>)}</tbody></table></section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">Fund Configuration</h2><p className="mt-1 text-xs text-amber-300">Sector exposure is a configurable starter map. Replace it with the latest scheme portfolio/factsheet weights in the holdings-sync phase.</p><div className="mt-3 overflow-x-auto"><table className="min-w-full text-xs"><thead className="text-slate-400"><tr><th className="p-2 text-left">Fund</th><th className="p-2 text-left">AMFI code</th><th className="p-2 text-left">Proxy</th><th className="p-2 text-left">Sector weights</th></tr></thead><tbody>{settings.fundsConfig.map(f => <tr key={f.id} className="border-t border-slate-800"><td className="p-2"><input className="w-56 rounded bg-slate-800 p-2" value={f.name} onChange={e => updateFund(f.id, { name: e.target.value })} /></td><td className="p-2"><input className="w-28 rounded bg-slate-800 p-2" value={f.schemeCode ?? ""} onChange={e => updateFund(f.id, { schemeCode: e.target.value || undefined })} /></td><td className="p-2"><input className="w-36 rounded bg-slate-800 p-2" value={f.proxyIndex} onChange={e => updateFund(f.id, { proxyIndex: e.target.value })} /></td><td className="p-2"><code className="text-slate-300">{JSON.stringify(f.sectorExposure)}</code></td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm">Strategic weight<input type="number" className="mt-1 w-full rounded bg-slate-800 p-2" value={settings.strategicWeight} onChange={e => setSettings({ ...settings, strategicWeight: Number(e.target.value) })} /></label><label className="text-sm">NAV opportunity weight<input type="number" className="mt-1 w-full rounded bg-slate-800 p-2" value={settings.navOpportunityWeight} onChange={e => setSettings({ ...settings, navOpportunityWeight: Number(e.target.value) })} /></label><label className="text-sm">Tactical top-up ₹<input type="number" className="mt-1 w-full rounded bg-slate-800 p-2" value={settings.tacticalTopupAmount ?? ""} onChange={e => setSettings({ ...settings, tacticalTopupAmount: e.target.value ? Number(e.target.value) : null })} /></label></div><button onClick={save} disabled={busy} className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Save Settings</button></section>
  </div></main>;
}
