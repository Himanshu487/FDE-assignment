import {describe,expect,it} from "vitest";
import {lastCompleteMonth,quarterForReportDate} from "../src/analytics/periods.js";
describe("dataset-relative periods",()=>{
 it("derives FY26–27 Q1 from the dataset end",()=>expect(quarterForReportDate("2026-06-30")).toEqual({start:"2026-04-01",endExclusive:"2026-07-01",label:"FY 26–27 Q1"}));
 it("uses June as the last complete month",()=>expect(lastCompleteMonth("2026-06-30")).toMatchObject({start:"2026-06-01",endExclusive:"2026-07-01"}));
});
