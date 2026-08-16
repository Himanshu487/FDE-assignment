import { db } from "../db.js";
import "../config.js";
import type { FreightInvoice, Period, RegionFilter } from "../types.js";
import { round } from "../analytics/math.js";

type Cache = { key: string; expires: number; value: FreightInvoice[] } | null;
let cache: Cache = null;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parseInvoices(body: unknown): { rows: FreightInvoice[]; cursor?: string } {
  const obj = body as Record<string, unknown>;
  const raw = (Array.isArray(obj.invoices) ? obj.invoices : Array.isArray(obj.data) ? obj.data : []) as Record<string, unknown>[];
  const rows = raw.map(i => ({
    deliveryId: Number(i.delivery_id ?? i.deliveryId),
    amountPaise: Number(i.amount_paise ?? i.freight_amount_paise ?? i.amountPaise),
    invoiceId: String(i.invoice_id ?? i.id ?? ""),
  })).filter(i => Number.isFinite(i.deliveryId) && Number.isFinite(i.amountPaise) && i.amountPaise >= 0);
  const cursor = obj.next_cursor ?? (obj.pagination as Record<string, unknown> | undefined)?.next_cursor;
  return { rows, cursor: cursor ? String(cursor) : undefined };
}

async function request(url: URL, apiKey: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { "x-api-key": apiKey, authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) });
      if (response.ok) return response.json();
      if (![429, 503].includes(response.status) || attempt === 3) throw new Error(`Partner API returned ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt, 5000));
    } catch (error) {
      if (attempt === 3) throw error;
      await wait(250 * 2 ** attempt);
    }
  }
  throw new Error("Partner API retry budget exhausted");
}

async function invoices(period: Period): Promise<FreightInvoice[]> {
  const base = process.env.PARTNER_FREIGHT_API_URL, key = process.env.PARTNER_FREIGHT_API_KEY;
  if (!base || !key) throw new Error("Partner freight API is not configured");
  const cacheKey = `${period.start}:${period.endExclusive}`;
  if (cache?.key === cacheKey && cache.expires > Date.now()) return cache.value;
  const all: FreightInvoice[] = []; let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(base); url.searchParams.set("start_date", period.start); url.searchParams.set("end_date", period.endExclusive);
    if (cursor) url.searchParams.set("cursor", cursor);
    const parsed = parseInvoices(await request(url, key)); all.push(...parsed.rows);
    if (!parsed.cursor) { cache = { key: cacheKey, expires: Date.now() + Number(process.env.FREIGHT_CACHE_TTL_MS ?? 900000), value: all }; return all; }
    if (parsed.cursor === cursor) throw new Error("Partner API repeated its pagination cursor");
    cursor = parsed.cursor;
  }
  throw new Error("Partner API exceeded 100-page safety limit");
}

export async function getFreight(period: Period, regionId: RegionFilter) {
  try {
    const rows = await invoices(period);
    if (!rows.length) return { status: "available", value: null, numerator: 0, denominator: 0, byWarehouse: [] };
    const deliveryIds = rows.map(r => r.deliveryId); const placeholders = deliveryIds.map(() => "?").join(",");
    const deliveries = db.prepare(`SELECT d.delivery_id, w.warehouse_name,
      SUM(l.delivered_qty/CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END) delivered_cases
      FROM deliveries d JOIN orders o USING(order_id) JOIN order_lines l USING(order_id) JOIN warehouses w ON w.warehouse_id=d.warehouse_id
      WHERE d.delivery_id IN (${placeholders}) AND (? IS NULL OR o.region_id=?) GROUP BY d.delivery_id,w.warehouse_name`).all(...deliveryIds, regionId, regionId) as {delivery_id:number;warehouse_name:string;delivered_cases:number}[];
    const costs = new Map(rows.map(r => [r.deliveryId, r.amountPaise / 100]));
    const grouped = new Map<string,{cost:number;cases:number}>(); let cost = 0, cases = 0;
    for (const d of deliveries) { const c = costs.get(d.delivery_id) ?? 0; cost += c; cases += d.delivered_cases; const g=grouped.get(d.warehouse_name)??{cost:0,cases:0}; g.cost+=c;g.cases+=d.delivered_cases;grouped.set(d.warehouse_name,g); }
    return { status: "available", value: round(cases ? cost/cases : null), numerator: round(cost), denominator: round(cases),
      byWarehouse: [...grouped].map(([name,g])=>({name,value:round(g.cases?g.cost/g.cases:null),cost:round(g.cost),deliveredCases:round(g.cases)})).sort((a,b)=>(b.value??0)-(a.value??0)) };
  } catch (error) { return { status: "unavailable", value: null, numerator: 0, denominator: 0, byWarehouse: [], message: error instanceof Error ? error.message : "Freight unavailable" }; }
}

export const __freightTest = { parseInvoices };
