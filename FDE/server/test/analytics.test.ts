import {describe,expect,it} from "vitest";
import {analytics} from "../src/services/analytics.js";
import {db} from "../src/db.js";
describe("trusted analytics integration",()=>{
 it("opens the supplied source database query-only",()=>expect(db.pragma("query_only",{simple:true})).toBe(1));
 it("derives report date and non-empty metrics from source",()=>{const d=analytics.getDashboard(null);expect(d.context.reportDate).toBe("2026-06-30");expect(d.service.caseFill.denominator).toBeGreaterThan(0);expect(d.service.otif.denominator).toBeGreaterThan(0)});
 it("defines OTIF as a true intersection",()=>{const s=analytics.getDashboard(null).service;expect(s.otif.numerator).toBeLessThanOrEqual(s.onTime.numerator);expect(s.otif.numerator).toBeLessThanOrEqual(s.inFull.numerator)});
});
