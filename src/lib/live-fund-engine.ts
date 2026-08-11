import type { DashboardPayload, FundComputed, FundConfig, IndexDashboardRow, SettingsPayload } from "@/lib/types";

type SearchRow = { schemeCode:number; schemeName:string; nav?:number };
type SearchResponse = SearchRow[] | { data?:SearchRow[]; status?:string };
type HistoryPoint = { date:string; nav:string|number };
type HistoryResponse = { data?:HistoryPoint[]; status?:string };
type Point = { at:Date; value:number };

const BASE="https://api.mfapi.in";
const clamp=(v:number,a=0,b=100)=>Math.max(a,Math.min(b,v));
const round=(v:number,d=2)=>Math.round(v*10**d)/10**d;
const pct=(a:number|null,b:number|null)=>a==null||b==null||a===0?null:((b-a)/a)*100;
const parseDate=(s:string)=>{const p=s.split("-").map(Number);if(p.length!==3)return null;const [a,b,c]=p;return a>1900?new Date(Date.UTC(a,b-1,c)):new Date(Date.UTC(c,b-1,a));};
const sma=(p:Point[],n:number)=>p.length<n?null:p.slice(-n).reduce((s,x)=>s+x.value,0)/n;
const before=(p:Point[],days:number)=>{const t=Date.now()-days*86400000;return [...p].reverse().find(x=>x.at.getTime()<=t)||p[0]||null};
const indexMove=(rows:IndexDashboardRow[],name:string)=>rows.find(x=>x.name.toUpperCase()===name.toUpperCase())?.today??0;
const weighted=(exposure:Record<string,number>,rows:IndexDashboardRow[])=>{let sum=0,w=0,count=0;for(const [name,weight] of Object.entries(exposure||{})){if(weight<=0)continue;const row=rows.find(x=>x.name.toUpperCase()===name.toUpperCase());if(!row)continue;sum+=row.today*weight;w+=weight;count++;}return {move:w?sum/w:0,count};};

async function history(code:number):Promise<Point[]>{
  try{
    const r=await fetch(`${BASE}/mf/${code}`,{cache:"no-store",headers:{accept:"application/json"}});
    if(!r.ok)return [];
    const j=await r.json() as HistoryResponse;
    return (j.data||[]).map(x=>({at:parseDate(String(x.date)),value:Number(x.nav)})).filter((x):x is Point=>!!x.at&&Number.isFinite(x.value)).sort((a,b)=>a.at.getTime()-b.at.getTime());
  }catch{return []}
}

async function searchFund(f:FundConfig):Promise<SearchRow|null>{
  try{
    const q=encodeURIComponent(f.schemeSearch);
    const r=await fetch(`${BASE}/mf/search?q=${q}`,{cache:"no-store",headers:{accept:"application/json"}});
    if(!r.ok)return null;
    const raw=await r.json() as SearchResponse;
    const rows=Array.isArray(raw)?raw:(raw.data||[]);
    const tokens=f.schemeSearch.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates=rows.filter(x=>x?.schemeName&&Number.isFinite(Number(x.schemeCode)));
    const directGrowth=candidates.filter(x=>/direct/i.test(x.schemeName)&&/growth/i.test(x.schemeName));
    const direct=candidates.filter(x=>/direct/i.test(x.schemeName));
    return directGrowth.find(x=>tokens.every(t=>x.schemeName.toLowerCase().includes(t)))||direct.find(x=>tokens.every(t=>x.schemeName.toLowerCase().includes(t)))||candidates.find(x=>tokens.every(t=>x.schemeName.toLowerCase().includes(t)))||directGrowth[0]||direct[0]||candidates[0]||null;
  }catch{return null}
}

async function resolveFund(f:FundConfig):Promise<{row:SearchRow|null;points:Point[]}> {
  // Configured schemeCode is authoritative. Name search is fallback only.
  const configuredCode=Number(f.schemeCode);
  if(Number.isFinite(configuredCode)&&configuredCode>0){
    const points=await history(configuredCode);
    if(points.length){return {row:{schemeCode:configuredCode,schemeName:f.name,nav:points.at(-1)?.value},points};}
  }
  const row=await searchFund(f);
  if(!row)return {row:null,points:[]};
  return {row,points:await history(Number(row.schemeCode))};
}

function metrics(p:Point[]){const latest=p.at(-1)?.value??null;const max52=Math.max(0,...p.slice(-252).map(x=>x.value));const maxAll=Math.max(0,...p.map(x=>x.value));return {drawdown52w:latest&&max52?((latest-max52)/max52)*100:null,drawdownAllTime:latest&&maxAll?((latest-maxAll)/maxAll)*100:null,return1m:pct(before(p,30)?.value??null,latest),return3m:pct(before(p,90)?.value??null,latest),return6m:pct(before(p,180)?.value??null,latest),sma20:sma(p,20),sma50:sma(p,50),sma100:sma(p,100),sma200:sma(p,200),momentum10d:pct(before(p,10)?.value??null,latest),momentum20d:pct(before(p,20)?.value??null,latest),momentum50d:pct(before(p,50)?.value??null,latest),relativeStrengthVsNifty50d:null as number|null};}

function fallback(f:FundConfig):FundComputed{return {id:f.id,name:f.name,schemeCode:f.schemeCode??null,proxyIndex:f.proxyIndex,latestNav:null,latestNavDate:null,mappedMove:0,weightedSectorMove:0,sectorOpportunityScore:50,matchedSectorCount:0,strategicScore:50,navOpportunityScore:50,finalDailyScore:50,classification:"Healthy Correction",actionTag:"SIP",reason:"Live mutual-fund NAV data is temporarily unavailable.",expectedImpactNote:"Wait for the next successful data refresh.",metrics:{drawdown52w:null,drawdownAllTime:null,return1m:null,return3m:null,return6m:null,sma20:null,sma50:null,sma100:null,sma200:null,momentum10d:null,momentum20d:null,momentum50d:null,relativeStrengthVsNifty50d:null}};}

function compute(f:FundConfig,row:SearchRow,p:Point[],indices:IndexDashboardRow[],settings:SettingsPayload):FundComputed{
  const latest=p.at(-1)?.value??row.nav??null;const m=metrics(p);const sector=weighted(f.sectorExposure,indices);const proxy=indexMove(indices,f.proxyIndex);
  const up=!!latest&&!!m.sma50&&!!m.sma200&&latest>m.sma50&&m.sma50>m.sma200;
  const broken=(!!latest&&!!m.sma200&&latest<m.sma200*.95)||((m.sma50??0)>0&&(m.sma200??0)>0&&(m.sma50!<m.sma200!*.97))||((m.return3m??0)<-15);
  const strategic=clamp((up?30:latest&&m.sma200&&latest>m.sma200?20:10)+clamp(((m.return6m??0)+15)*1.1,0,25)+clamp(20-Math.abs(m.drawdownAllTime??-20)*.3,0,20)+clamp(((m.momentum50d??0)+10)*.8,0,15));
  const opportunity=clamp(clamp(-sector.move*16,0,35)+clamp(Math.abs(Math.min(m.drawdown52w??0,0))*1.2,0,20)+(broken?0:up?20:10)+clamp(((m.momentum20d??0)+8)*.8,0,15));
  const sectorScore=clamp(50-sector.move*20);let action:FundComputed["actionTag"]="SIP";let classification:FundComputed["classification"]="Healthy Correction";let reason="Long-term trend and current sector conditions do not show a strong tactical edge.";
  if(broken){action="AVOID TODAY";classification="Structural Breakdown";reason="The fund's medium/long-term trend filter is weak."}else if(sector.move<=-1.75&&sectorScore>=75&&strategic>=55){action="STRONG BUY TODAY";reason="Relevant sectors are under strong pressure while the fund structure remains healthy."}else if(sector.move<=-1&&sectorScore>=62){action="BUY ON DIP";reason="Relevant sectors are weak today and the fund structure remains supportive."}else if(sector.move<=-.4&&strategic>=55){action="ACCUMULATE";reason="Relevant sectors are mildly weak while the medium/long-term structure remains supportive."}else if(sector.move>.75||proxy>.75){action="WAIT";reason="Relevant sectors are strong today, so the tactical dip opportunity is limited."}
  const final=clamp(.8*((settings.strategicWeight/100)*strategic+(settings.navOpportunityWeight/100)*opportunity)+.2*sectorScore);
  return {id:f.id,name:f.name,schemeCode:String(row.schemeCode),proxyIndex:f.proxyIndex,latestNav:latest,latestNavDate:p.at(-1)?.at.toISOString().slice(0,10)??null,mappedMove:round(proxy),weightedSectorMove:round(sector.move),sectorOpportunityScore:round(sectorScore),matchedSectorCount:sector.count,strategicScore:round(strategic),navOpportunityScore:round(opportunity),finalDailyScore:round(final),classification,actionTag:action,reason,expectedImpactNote:sector.move<0?"Relevant sector weakness may pressure the next closing NAV; mutual-fund NAV is published end-of-day.":"Relevant sectors are not broadly under pressure today.",metrics:{drawdown52w:m.drawdown52w==null?null:round(m.drawdown52w),drawdownAllTime:m.drawdownAllTime==null?null:round(m.drawdownAllTime),return1m:m.return1m==null?null:round(m.return1m),return3m:m.return3m==null?null:round(m.return3m),return6m:m.return6m==null?null:round(m.return6m),sma20:m.sma20,sma50:m.sma50,sma100:m.sma100,sma200:m.sma200,momentum10d:m.momentum10d==null?null:round(m.momentum10d),momentum20d:m.momentum20d==null?null:round(m.momentum20d),momentum50d:m.momentum50d==null?null:round(m.momentum50d),relativeStrengthVsNifty50d:null}};
}

export async function buildLiveFundPayload(base:DashboardPayload):Promise<DashboardPayload>{
  const settings=base.settings;const indices=base.indexDashboard;
  const resolved=await Promise.all(settings.fundsConfig.map(async f=>{const live=await resolveFund(f);return {fund:f,row:live.row,points:live.points};}));
  const funds=resolved.map(x=>x.row?compute(x.fund,x.row,x.points.length?x.points:[{at:new Date(),value:x.row.nav??0}],indices,settings):fallback(x.fund));
  const topFunds=[...funds].sort((a,b)=>b.finalDailyScore-a.finalDailyScore).slice(0,5);const avoidFunds=funds.filter(f=>f.actionTag==="AVOID TODAY");const tacticalBase=topFunds.filter(f=>f.actionTag.includes("BUY")||f.actionTag==="ACCUMULATE");const tacticalAllocation=settings.tacticalTopupAmount&&tacticalBase.length?tacticalBase.map(f=>({fundId:f.id,fundName:f.name,amount:settings.tacticalTopupAmount!/tacticalBase.length,weightPercent:100/tacticalBase.length})):[];const liveCount=funds.filter(f=>f.latestNav!=null).length;
  return {...base,funds,topFunds,avoidFunds,tacticalAllocation,sourceStatus:{...base.sourceStatus,amfi:liveCount?"ok":"unavailable",note:`No database. NSE/index data is live; ${liveCount}/${funds.length} mutual funds resolved through exact scheme codes + NAV history, with MFAPI name search as fallback.`}};
}
