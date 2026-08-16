import { analytics } from "./analytics.js";
import type { RegionFilter } from "../types.js";

export interface AskAnswer { intent: string; title: string; explanation: string; columns: string[]; rows: Record<string, unknown>[]; }

export function answerQuestion(question: string, regionId: RegionFilter): AskAnswer {
  const q = question.toLowerCase().trim();
  const context = analytics.getReportContext();
  if ((q.includes("lowest") || q.includes("worst")) && q.includes("outlet") && q.includes("fill")) {
    const rows = analytics.serviceBreakdown("outlet", context.lastMonth, regionId, 5);
    return { intent:"lowest_fill_outlets", title:`Lowest case fill outlets — ${context.lastMonth.label}`, explanation:"Active, non-test outlets with at least five completed/partial orders; ranked on historical-pack case fill.", columns:["name","case_fill","orders"], rows };
  }
  if (q.includes("otif") && q.includes("region")) {
    const rows = analytics.serviceBreakdown("region", context.quarter, regionId, 10);
    return { intent:"otif_by_region", title:`OTIF by region — ${context.quarter.label}`, explanation:"OTIF is the order-level intersection of recorded on-time delivery and operationally in-full status.", columns:["name","otif","orders"], rows };
  }
  if ((q.includes("late") || q.includes("2 hour")) && q.includes("route")) {
    const rows = analytics.getDashboard(regionId).attention.lateRoutes;
    return { intent:"late_routes", title:"Routes with >2 hour delays on >10% of deliveries", explanation:"Uses the operational delay_minutes field and requires at least ten deliveries.", columns:["name","late_pct","late_deliveries","deliveries"], rows };
  }
  if (q.includes("return") && (q.includes("categor") || q.includes("driver") || q.includes("reason"))) {
    const data=analytics.getDashboard(regionId).returns;
    return { intent:"return_drivers", title:"Approved return-value drivers", explanation:`Leading reason: ${String(data.reasons[0]?.name ?? "None")}. Approval uses status because approval dates are missing.`, columns:["name","value","count"], rows:data.drivers };
  }
  if (q.includes("temperature") || q.includes("excursion")) {
    const c=analytics.getDashboard(regionId).coldChain.excursionRate;
    return { intent:"temperature_excursions", title:"Temperature excursions per 100 chilled deliveries", explanation:`${c.numerator} excursions across ${c.denominator} chilled deliveries.`, columns:["excursions_per_100","excursions","chilled_deliveries"], rows:[{excursions_per_100:c.value,excursions:c.numerator,chilled_deliveries:c.denominator}] };
  }
  if (q.includes("discontinued") || (q.includes("outlet") && q.includes("sku"))) {
    return { intent:"discontinued_skus", title:"Orders after SKU discontinuation", explanation:"Compares order date to each product's discontinuation date.", columns:["sku_code","product_name","discontinued_date","orders","outlets"], rows:analytics.discontinuedOrders(context.quarter,regionId) };
  }
  if (q.includes("why") && q.includes("fill")) {
    const data=analytics.getDashboard(regionId);
    return { intent:"fill_rate_explanation", title:"Why fill rate moved", explanation:"Deterministic diagnostic: monthly case/eaches trends are shown alongside the highest-value return drivers. Short-reason data is not exposed as causal proof, so this is correlation, not causation.", columns:["month","case_fill","each_fill"], rows:data.trends };
  }
  return { intent:"help", title:"Questions I can answer", explanation:"Try lowest fill-rate outlets, OTIF by region, late routes, return drivers, temperature excursions, freight by warehouse, discontinued SKUs, or why fill rate dropped.", columns:[], rows:[] };
}
