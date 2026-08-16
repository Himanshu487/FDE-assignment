export function safePercent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function safeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function toEaches(quantity: number, uom: string, casePackAtOrder: number): number {
  return uom === "CASE" ? quantity * casePackAtOrder : quantity;
}

export function toCases(quantity: number, uom: string, casePackAtOrder: number): number {
  return uom === "CASE" ? quantity : quantity / casePackAtOrder;
}

export function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
