export interface Period {
  start: string;
  endExclusive: string;
  label: string;
}

export interface Metric {
  value: number | null;
  numerator: number;
  denominator: number;
  unit: "percent" | "inr" | "inr_per_case" | "per_100" | "cases";
}

export type RegionFilter = number | null;

export interface FreightInvoice {
  deliveryId: number;
  amountPaise: number;
  invoiceId?: string;
}
