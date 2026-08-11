import {DEFAULT_SECTOR_EXPOSURES} from "@/lib/sector-exposure";
import type {FundConfig,SettingsPayload} from "@/lib/types";
export const TRACKED_INDICES=["NIFTY 50","NIFTY NEXT 50","NIFTY MIDCAP 150","NIFTY SMALLCAP 250","NIFTY BANK","NIFTY FINANCIAL SERVICES","NIFTY IT","NIFTY AUTO","NIFTY PHARMA","NIFTY FMCG","NIFTY METAL","NIFTY REALTY","NIFTY ENERGY","NIFTY PSU BANK","NIFTY INFRASTRUCTURE","NIFTY SERVICES SECTOR","SENSEX"];
const f=(x:Omit<FundConfig,"sectorExposure">):FundConfig=>({...x,sectorExposure:DEFAULT_SECTOR_EXPOSURES[x.id]??{[x.proxyIndex]:100}});
export const DEFAULT_FUNDS:FundConfig[]=[
 f({id:"quant-flexi-cap",name:"Quant Flexi Cap Fund Direct Growth",schemeCode:"120843",schemeSearch:"Quant Flexi Cap Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"quant-large-mid",name:"Quant Large and Mid Cap Fund Direct Growth",schemeCode:"120826",schemeSearch:"Quant Large and Mid Cap Fund Direct Growth",proxyIndex:"NIFTY MIDCAP 150"}),
 f({id:"quant-multi-asset",name:"Quant Multi Asset Fund Direct Growth",schemeCode:"120821",schemeSearch:"Quant Multi Asset Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"quant-multi-cap",name:"Quant Multi Cap Fund Direct Growth",schemeCode:"120823",schemeSearch:"Quant Multi Cap Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"quant-infrastructure",name:"Quant Infrastructure Fund Direct Growth",schemeCode:"120833",schemeSearch:"Quant Infrastructure Fund Direct Growth",proxyIndex:"NIFTY INFRASTRUCTURE"}),
 f({id:"quant-bfsi",name:"Quant BFSI Fund Direct Growth",schemeCode:"151791",schemeSearch:"Quant BFSI Fund Direct Growth",proxyIndex:"NIFTY FINANCIAL SERVICES"}),
 f({id:"sbi-nifty-50",name:"SBI Nifty 50 Index Fund Direct Growth",schemeCode:"119827",schemeSearch:"SBI Nifty 50 Index Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"sbi-healthcare",name:"SBI Healthcare Opportunities Fund Direct Growth",schemeCode:"119783",schemeSearch:"SBI Healthcare Opportunities Fund Direct Growth",proxyIndex:"NIFTY PHARMA"}),
 f({id:"sbi-focused",name:"SBI Focused Equity Fund Direct Growth",schemeCode:"119727",schemeSearch:"SBI Focused Equity Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"sbi-children",name:"SBI Children's Benefit Fund Direct Growth",schemeCode:"148490",schemeSearch:"SBI Children's Benefit Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"bandhan-small",name:"Bandhan Small Cap Fund Direct Growth",schemeCode:"147946",schemeSearch:"Bandhan Small Cap Fund Direct Growth",proxyIndex:"NIFTY SMALLCAP 250"}),
 f({id:"hdfc-mid-cap",name:"HDFC Mid Cap Opportunities Fund Direct Growth",schemeCode:"118989",schemeSearch:"HDFC Mid Cap Opportunities Fund Direct Growth",proxyIndex:"NIFTY MIDCAP 150"}),
 f({id:"uti-next-50",name:"UTI Nifty Next 50 Index Fund Direct Growth",schemeCode:"143341",schemeSearch:"UTI Nifty Next 50 Index Fund Direct Growth",proxyIndex:"NIFTY NEXT 50"}),
 f({id:"uti-gold",name:"UTI Gold ETF FoF Direct Growth",schemeCode:"150714",schemeSearch:"UTI Gold ETF FoF Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"sbi-small-cap",name:"SBI Small Cap Fund Direct Growth",schemeCode:"125497",schemeSearch:"SBI Small Cap Fund Direct Growth",proxyIndex:"NIFTY SMALLCAP 250"}),
 f({id:"icici-value",name:"ICICI Prudential Value Discovery Fund Direct Growth",schemeCode:"120586",schemeSearch:"ICICI Prudential Value Discovery Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"axis-elss",name:"Axis ELSS Tax Saver Fund Direct Growth",schemeCode:"120503",schemeSearch:"Axis ELSS Tax Saver Fund Direct Growth",proxyIndex:"NIFTY 50"}),
 f({id:"sundaram-services",name:"Sundaram Services Fund Direct Growth",schemeCode:"144835",schemeSearch:"Sundaram Services Fund Direct Growth",proxyIndex:"NIFTY SERVICES SECTOR"}),
 f({id:"tata-digital",name:"Tata Digital India Fund Direct Growth",schemeCode:"135800",schemeSearch:"Tata Digital India Fund Direct Growth",proxyIndex:"NIFTY IT"})
];
export const DEFAULT_SETTINGS:SettingsPayload={marketDataProvider:"nse",strategicWeight:55,navOpportunityWeight:45,tacticalTopupAmount:null,fundsConfig:DEFAULT_FUNDS};
