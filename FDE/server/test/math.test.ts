import {describe,expect,it} from "vitest";
import {safePercent,toCases,toEaches} from "../src/analytics/math.js";

describe("UOM conversion",()=>{
  it("uses historical case pack for CASE quantities",()=>expect(toEaches(3,"CASE",24)).toBe(72));
  it("converts EACH quantities to fractional cases",()=>expect(toCases(18,"EACH",24)).toBe(.75));
  it("does not alter quantities already in their target UOM",()=>{expect(toCases(3,"CASE",24)).toBe(3);expect(toEaches(18,"EACH",24)).toBe(18)});
});
describe("safe percentages",()=>{
  it("calculates a percentage",()=>expect(safePercent(8,10)).toBe(80));
  it("returns null rather than inventing a zero denominator result",()=>expect(safePercent(0,0)).toBeNull());
});
