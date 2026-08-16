import { db } from "../db.js";
import { lastCompleteMonth, quarterForReportDate } from "../analytics/periods.js";
import { round, safePercent } from "../analytics/math.js";
import type { Period, RegionFilter } from "../types.js";

type Row = Record<string, number | string | null>;
const one = (sql: string, params: object = {}) => db.prepare(sql).get(params) as Row;
const many = (sql: string, params: object = {}) => db.prepare(sql).all(params) as Row[];
const params = (period: Period, regionId: RegionFilter) => ({ start: period.start, end: period.endExclusive, regionId });

const eligible = `o.order_status IN ('DELIVERED','PARTIAL')
  AND x.status='ACTIVE' AND x.is_deleted=0
  AND lower(x.outlet_name) NOT LIKE '%test%'
  AND lower(x.outlet_name) NOT LIKE '%migration%'
  AND (@regionId IS NULL OR o.region_id=@regionId)`;

export function getReportContext() {
  const reportDate = String(one("SELECT MAX(order_date) report_date FROM orders").report_date);
  return { reportDate, quarter: quarterForReportDate(reportDate), lastMonth: lastCompleteMonth(reportDate) };
}

function service(period: Period, regionId: RegionFilter) {
  const row = one(`
    WITH line_metrics AS (
      SELECT
        SUM(l.ordered_qty * CASE WHEN l.qty_uom='CASE' THEN l.case_pack_at_order ELSE 1 END) ordered_eaches,
        SUM(l.delivered_qty * CASE WHEN l.qty_uom='CASE' THEN l.case_pack_at_order ELSE 1 END) delivered_eaches,
        SUM(l.ordered_qty / CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END) ordered_cases,
        SUM(l.delivered_qty / CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END) delivered_cases
      FROM orders o JOIN outlets x USING(outlet_id) JOIN order_lines l USING(order_id)
      WHERE o.order_date>=@start AND o.order_date<@end AND ${eligible}
    ), order_metrics AS (
      SELECT COUNT(DISTINCT o.order_id) eligible_orders,
        COUNT(DISTINCT CASE WHEN d.delay_minutes<=0 AND o.order_status='DELIVERED' THEN o.order_id END) otif_orders,
        COUNT(DISTINCT CASE WHEN d.delay_minutes<=0 THEN o.order_id END) on_time_orders,
        COUNT(DISTINCT CASE WHEN o.order_status='DELIVERED' THEN o.order_id END) in_full_orders
      FROM orders o JOIN outlets x USING(outlet_id) JOIN deliveries d USING(order_id)
      WHERE o.order_date>=@start AND o.order_date<@end AND ${eligible}
    ) SELECT * FROM line_metrics CROSS JOIN order_metrics`, params(period, regionId));
  const oe = Number(row.ordered_eaches ?? 0), de = Number(row.delivered_eaches ?? 0);
  const oc = Number(row.ordered_cases ?? 0), dc = Number(row.delivered_cases ?? 0);
  const orders = Number(row.eligible_orders ?? 0), otif = Number(row.otif_orders ?? 0);
  return {
    eachFill: { value: round(safePercent(de, oe)), numerator: round(de), denominator: round(oe), unit: "percent" },
    caseFill: { value: round(safePercent(dc, oc)), numerator: round(dc), denominator: round(oc), unit: "percent" },
    otif: { value: round(safePercent(otif, orders)), numerator: otif, denominator: orders, unit: "percent" },
    onTime: { value: round(safePercent(Number(row.on_time_orders), orders)), numerator: Number(row.on_time_orders), denominator: orders, unit: "percent" },
    inFull: { value: round(safePercent(Number(row.in_full_orders), orders)), numerator: Number(row.in_full_orders), denominator: orders, unit: "percent" },
    deliveredCases: round(dc),
  };
}

function returns(period: Period, regionId: RegionFilter) {
  const approved = one(`SELECT COUNT(*) count, COALESCE(SUM(r.credit_note_value_inr),0) value
    FROM returns_credit_notes r JOIN orders o USING(order_id) JOIN outlets x ON x.outlet_id=o.outlet_id
    WHERE r.return_date>=@start AND r.return_date<@end AND r.status='APPROVED' AND ${eligible}`, params(period, regionId));
  const delivered = one(`SELECT COALESCE(SUM(l.delivered_qty*l.unit_price_inr*(1-l.line_discount_pct/100.0)),0) value
    FROM deliveries d JOIN orders o USING(order_id) JOIN outlets x USING(outlet_id) JOIN order_lines l USING(order_id)
    WHERE d.dispatch_datetime>=@start AND d.dispatch_datetime<@end AND ${eligible}`, params(period, regionId));
  const value = Number(approved.value), denominator = Number(delivered.value);
  const drivers = many(`SELECT p.category name, ROUND(SUM(r.credit_note_value_inr),2) value, COUNT(*) count
    FROM returns_credit_notes r JOIN products p USING(product_id) JOIN orders o USING(order_id) JOIN outlets x ON x.outlet_id=o.outlet_id
    WHERE r.return_date>=@start AND r.return_date<@end AND r.status='APPROVED' AND ${eligible}
    GROUP BY p.category ORDER BY value DESC LIMIT 6`, params(period, regionId));
  const reasons = many(`SELECT r.return_reason_code name, ROUND(SUM(r.credit_note_value_inr),2) value, COUNT(*) count
    FROM returns_credit_notes r JOIN orders o USING(order_id) JOIN outlets x ON x.outlet_id=o.outlet_id
    WHERE r.return_date>=@start AND r.return_date<@end AND r.status='APPROVED' AND ${eligible}
    GROUP BY r.return_reason_code ORDER BY value DESC LIMIT 6`, params(period, regionId));
  return { approvedValue: value, approvedCount: Number(approved.count), deliveredValue: round(denominator),
    returnRate: { value: round(safePercent(value, denominator)), numerator: value, denominator: round(denominator), unit: "percent" }, drivers, reasons };
}

function coldChain(period: Period, regionId: RegionFilter, reportDate: string) {
  const delivery = one(`SELECT COUNT(*) chilled_deliveries,
      SUM(CASE WHEN d.temperature_excursion_flag=1 THEN 1 ELSE 0 END) excursions
    FROM deliveries d JOIN orders o USING(order_id) JOIN outlets x USING(outlet_id)
    WHERE d.dispatch_datetime>=@start AND d.dispatch_datetime<@end AND ${eligible}
      AND EXISTS (SELECT 1 FROM order_lines l JOIN products p USING(product_id) WHERE l.order_id=o.order_id AND p.is_chilled=1)`, params(period, regionId));
  const near = one(`WITH latest AS (SELECT MAX(snapshot_date) snapshot_date FROM inventory_snapshots WHERE snapshot_date<=@reportDate)
    SELECT COALESCE(SUM(i.available_cases),0) cases, COUNT(DISTINCT i.batch_id) batches, latest.snapshot_date snapshot_date
    FROM inventory_snapshots i JOIN latest ON i.snapshot_date=latest.snapshot_date JOIN warehouses w USING(warehouse_id)
    WHERE i.available_cases>0 AND date(i.expiry_date)>=date(i.snapshot_date)
      AND date(i.expiry_date)<=date(i.snapshot_date,'+30 days') AND (@regionId IS NULL OR w.region_id=@regionId)`, { reportDate, regionId });
  const credits = one(`SELECT COALESCE(SUM(r.credit_note_value_inr),0) value, COUNT(*) count
    FROM returns_credit_notes r JOIN products p USING(product_id) JOIN orders o USING(order_id) JOIN outlets x ON x.outlet_id=o.outlet_id
    WHERE r.return_date>=@start AND r.return_date<@end AND r.status='APPROVED' AND p.is_chilled=1 AND ${eligible}`, params(period, regionId));
  const n = Number(delivery.excursions ?? 0), d = Number(delivery.chilled_deliveries ?? 0);
  return { excursionRate: { value: round(d ? n * 100 / d : null), numerator: n, denominator: d, unit: "per_100" },
    nearExpiryCases: Number(near.cases), nearExpiryBatches: Number(near.batches), snapshotDate: near.snapshot_date,
    coldCreditValue: Number(credits.value), coldCreditCount: Number(credits.count) };
}

type Dimension = "outlet" | "route" | "warehouse" | "region";
const dimensions = {
  outlet: { id: "x.outlet_id", name: "x.outlet_name" },
  route: { id: "rt.route_id", name: "rt.route_name" },
  warehouse: { id: "w.warehouse_id", name: "w.warehouse_name" },
  region: { id: "rg.region_id", name: "rg.region_name" },
};

export function serviceBreakdown(dimension: Dimension, period: Period, regionId: RegionFilter, limit = 8) {
  const d = dimensions[dimension];
  return many(`SELECT ${d.id} id, ${d.name} name, COUNT(DISTINCT o.order_id) orders,
      ROUND(100.0*SUM(l.delivered_qty/CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END)/
        NULLIF(SUM(l.ordered_qty/CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END),0),2) case_fill,
      ROUND(100.0*COUNT(DISTINCT CASE WHEN dv.delay_minutes<=0 AND o.order_status='DELIVERED' THEN o.order_id END)/
        NULLIF(COUNT(DISTINCT o.order_id),0),2) otif
    FROM orders o JOIN outlets x USING(outlet_id) JOIN order_lines l USING(order_id)
      LEFT JOIN deliveries dv USING(order_id) LEFT JOIN routes rt ON rt.route_id=o.route_id
      LEFT JOIN warehouses w ON w.warehouse_id=o.warehouse_id LEFT JOIN regions rg ON rg.region_id=o.region_id
    WHERE o.order_date>=@start AND o.order_date<@end AND ${eligible}
    GROUP BY ${d.id},${d.name} HAVING COUNT(DISTINCT o.order_id)>=5 ORDER BY case_fill ASC LIMIT @limit`, { ...params(period, regionId), limit });
}

function lateRoutes(period: Period, regionId: RegionFilter) {
  return many(`SELECT rt.route_id id, rt.route_name name, COUNT(*) deliveries,
    SUM(d.delay_minutes>120) late_deliveries, ROUND(100.0*SUM(d.delay_minutes>120)/COUNT(*),2) late_pct
    FROM deliveries d JOIN orders o USING(order_id) JOIN outlets x USING(outlet_id) JOIN routes rt ON rt.route_id=d.route_id
    WHERE d.dispatch_datetime>=@start AND d.dispatch_datetime<@end AND ${eligible}
    GROUP BY rt.route_id,rt.route_name HAVING COUNT(*)>=10 AND 100.0*SUM(d.delay_minutes>120)/COUNT(*)>10
    ORDER BY late_pct DESC LIMIT 12`, params(period, regionId));
}

function trends(period: Period, regionId: RegionFilter) {
  return many(`SELECT substr(o.order_date,1,7) month,
    ROUND(100.0*SUM(l.delivered_qty*CASE WHEN l.qty_uom='CASE' THEN l.case_pack_at_order ELSE 1 END)/
      SUM(l.ordered_qty*CASE WHEN l.qty_uom='CASE' THEN l.case_pack_at_order ELSE 1 END),2) each_fill,
    ROUND(100.0*SUM(l.delivered_qty/CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END)/
      SUM(l.ordered_qty/CASE WHEN l.qty_uom='CASE' THEN 1.0 ELSE l.case_pack_at_order END),2) case_fill
    FROM orders o JOIN outlets x USING(outlet_id) JOIN order_lines l USING(order_id)
    WHERE o.order_date>=@start AND o.order_date<@end AND ${eligible} GROUP BY month ORDER BY month`, params(period, regionId));
}

export function discontinuedOrders(period: Period, regionId: RegionFilter) {
  return many(`SELECT p.sku_code, p.product_name, p.discontinued_date, COUNT(DISTINCT o.order_id) orders,
      COUNT(DISTINCT o.outlet_id) outlets
    FROM orders o JOIN outlets x USING(outlet_id) JOIN order_lines l USING(order_id) JOIN products p USING(product_id)
    WHERE o.order_date>=@start AND o.order_date<@end AND p.discontinued_date IS NOT NULL
      AND date(o.order_date)>date(p.discontinued_date) AND ${eligible}
    GROUP BY p.product_id ORDER BY orders DESC LIMIT 10`, params(period, regionId));
}

export function getDashboard(regionId: RegionFilter = null) {
  const context = getReportContext();
  const period = context.quarter;
  return { context, regionId, service: service(period, regionId), returns: returns(period, regionId),
    coldChain: coldChain(period, regionId, context.reportDate),
    attention: { outlets: serviceBreakdown("outlet", context.lastMonth, regionId, 5), routes: serviceBreakdown("route", period, regionId, 5),
      warehouses: serviceBreakdown("warehouse", period, regionId, 5), regions: serviceBreakdown("region", period, regionId, 5), lateRoutes: lateRoutes(period, regionId) },
    trends: trends(period, regionId), discontinued: discontinuedOrders(period, regionId),
    regions: many("SELECT region_id id, region_name name FROM regions WHERE status='ACTIVE' ORDER BY region_name") };
}

export const analytics = { getDashboard, getReportContext, serviceBreakdown, discontinuedOrders };
