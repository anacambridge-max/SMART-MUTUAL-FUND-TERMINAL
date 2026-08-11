import type { SectorExposure } from "@/lib/types";
const one=(x:string):SectorExposure=>({[x]:100});
export const DEFAULT_SECTOR_EXPOSURES:Record<string,SectorExposure>={
 "quant-flexi-cap":{"NIFTY 50":45,"NIFTY FINANCIAL SERVICES":15,"NIFTY IT":10,"NIFTY FMCG":8,"NIFTY PHARMA":7,"NIFTY SERVICES SECTOR":15},
 "quant-large-mid":{"NIFTY 50":45,"NIFTY MIDCAP 150":55},
 "quant-multi-asset":{"NIFTY 50":55,"NIFTY FINANCIAL SERVICES":15,"NIFTY IT":10,"NIFTY PHARMA":5,"NIFTY SERVICES SECTOR":15},
 "quant-multi-cap":{"NIFTY 50":40,"NIFTY MIDCAP 150":30,"NIFTY SMALLCAP 250":30},
 "quant-infrastructure":{"NIFTY INFRASTRUCTURE":60,"NIFTY ENERGY":15,"NIFTY METAL":10,"NIFTY REALTY":5,"NIFTY SERVICES SECTOR":10},
 "quant-bfsi":{"NIFTY BANK":50,"NIFTY FINANCIAL SERVICES":35,"NIFTY PSU BANK":15},
 "sbi-nifty-50":one("NIFTY 50"),
 "sbi-healthcare":one("NIFTY PHARMA"),
 "sbi-focused":{"NIFTY 50":60,"NIFTY FINANCIAL SERVICES":15,"NIFTY IT":10,"NIFTY PHARMA":5,"NIFTY SERVICES SECTOR":10},
 "sbi-children":{"NIFTY 50":70,"NIFTY FINANCIAL SERVICES":10,"NIFTY IT":8,"NIFTY FMCG":5,"NIFTY PHARMA":7},
 "bandhan-small":one("NIFTY SMALLCAP 250"),
 "hdfc-mid-cap":one("NIFTY MIDCAP 150"),
 "uti-next-50":one("NIFTY NEXT 50"),
 "uti-gold":{},
 "sbi-small-cap":one("NIFTY SMALLCAP 250"),
 "icici-value":{"NIFTY 50":60,"NIFTY FINANCIAL SERVICES":15,"NIFTY IT":8,"NIFTY FMCG":7,"NIFTY PHARMA":5,"NIFTY SERVICES SECTOR":5},
 "axis-elss":{"NIFTY 50":55,"NIFTY IT":15,"NIFTY FINANCIAL SERVICES":15,"NIFTY PHARMA":5,"NIFTY SERVICES SECTOR":10},
 "sundaram-services":one("NIFTY SERVICES SECTOR"),
 "tata-digital":one("NIFTY IT")
};
