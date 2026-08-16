import type { Period } from "../types.js";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);

export function quarterForReportDate(reportDate: string): Period {
  const date = utcDate(reportDate);
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const start = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 1));
  const fiscalYearStart = month >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  const fiscalQuarter = Math.floor(((month + 9) % 12) / 3) + 1;
  return {
    start: iso(start),
    endExclusive: iso(end),
    label: `FY ${fiscalYearStart % 100}\u2013${(fiscalYearStart + 1) % 100} Q${fiscalQuarter}`,
  };
}

export function lastCompleteMonth(reportDate: string): Period {
  const date = utcDate(reportDate);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: iso(start), endExclusive: iso(end), label: start.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
