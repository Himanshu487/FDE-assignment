import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { analytics } from "./analytics.js";
import { type AskAnswer } from "./ask.js";
import { getFreight } from "./freight.js";
import type { Period, RegionFilter } from "../types.js";

const defaultModel = "gemini-3.6-flash";
const maximumQuestionLength = 2_000;

const intents = [
  "service_breakdown",
  "return_drivers",
  "returns_by_region",
  "cold_chain",
  "late_routes",
  "discontinued_skus",
  "fill_trends",
  "freight_by_warehouse",
  "freight_by_carrier",
  "help",
] as const;

type Intent = typeof intents[number];
type PeriodChoice = "quarter" | "last_complete_month";
type ServiceDimension = "region" | "warehouse" | "route" | "outlet";
type ServiceMetric = "case_fill" | "otif";

interface IntentSelection {
  intent: Intent;
  period: PeriodChoice;
  dimension: ServiceDimension;
  metric: ServiceMetric;
  limit: number;
}

const intentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: intents,
      description: "The single reviewed Kestrel analytics operation that best answers the question.",
    },
    period: {
      type: "string",
      enum: ["quarter", "last_complete_month"],
      description: "Use last_complete_month only when the user explicitly asks for last month; otherwise use quarter.",
    },
    dimension: {
      type: "string",
      enum: ["region", "warehouse", "route", "outlet"],
      description: "Service breakdown dimension. Use region as the harmless default for non-service intents.",
    },
    metric: {
      type: "string",
      enum: ["case_fill", "otif"],
      description: "Service metric to rank ascending. Use case_fill as the harmless default for non-service intents.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Number of ranked results requested, defaulting to five.",
    },
  },
  required: ["intent", "period", "dimension", "metric", "limit"],
} as const;

function periodFor(choice: PeriodChoice): Period {
  const context = analytics.getReportContext();
  return choice === "last_complete_month" ? context.lastMonth : context.quarter;
}

function serviceAnswer(selection: IntentSelection, regionId: RegionFilter): AskAnswer {
  const period = periodFor(selection.period);
  const rows = analytics.serviceBreakdown(
    selection.dimension,
    period,
    regionId,
    selection.limit,
    selection.metric,
  );
  const metricLabel = selection.metric === "otif" ? "OTIF" : "case fill";
  return {
    intent: "service_breakdown",
    title: `Lowest ${metricLabel} by ${selection.dimension} — ${period.label}`,
    explanation: selection.metric === "otif"
      ? "OTIF is the order-level intersection of recorded on-time delivery and operationally in-full status."
      : "Case fill uses historical pack sizes and eligible delivered/partial orders.",
    columns: ["name", selection.metric, "orders"],
    rows,
  };
}

function returnsByRegion(regionId: RegionFilter): AskAnswer {
  const context = analytics.getReportContext();
  const selectedRegions = regionId === null
    ? analytics.getRegions()
    : analytics.getRegions().filter(row => Number(row.id) === regionId);
  const rows = selectedRegions.map(row => {
    const returns = analytics.getReturns(context.quarter, Number(row.id));
    return {
      name: row.name,
      value: returns.approvedValue,
      return_rate: returns.returnRate.value,
      approved_credits: returns.approvedCount,
    };
  }).sort((a, b) => Number(b.value) - Number(a.value));
  return {
    intent: "returns_by_region",
    title: `Highest approved return value by region — ${context.quarter.label}`,
    explanation: "Regions are ranked by approved credit-note value; return rate is approved value divided by delivered value.",
    columns: ["name", "value", "return_rate", "approved_credits"],
    rows,
  };
}

export async function reviewedAnswerFor(selection: IntentSelection, regionId: RegionFilter): Promise<AskAnswer> {
  const context = analytics.getReportContext();

  switch (selection.intent) {
    case "service_breakdown":
      return serviceAnswer(selection, regionId);
    case "return_drivers": {
      const returns = analytics.getReturns(context.quarter, regionId);
      return {
        intent: selection.intent,
        title: `Biggest approved return drivers — ${context.quarter.label}`,
        explanation: "Categories are ranked by approved credit-note value.",
        columns: ["name", "value", "count"],
        rows: returns.drivers,
      };
    }
    case "returns_by_region":
      return returnsByRegion(regionId);
    case "cold_chain": {
      const cold = analytics.getColdChain(context.quarter, regionId, context.reportDate);
      return {
        intent: selection.intent,
        title: `Cold-chain issues — ${context.quarter.label}`,
        explanation: "Reviewed indicators cover temperature excursions, near-expiry available inventory, and approved chilled-product credits.",
        columns: ["name", "value", "detail"],
        rows: [
          { name: "Temperature excursions per 100 chilled deliveries", excursions_per_100: cold.excursionRate.value, detail: `${cold.excursionRate.numerator} excursions / ${cold.excursionRate.denominator} chilled deliveries` },
          { name: "Near-expiry inventory (≤30 days)", cases: cold.nearExpiryCases, detail: `${cold.nearExpiryBatches} batches at ${cold.snapshotDate}` },
          { name: "Approved chilled-product credits (INR)", value: cold.coldCreditValue, detail: `${cold.coldCreditCount} credit notes` },
        ],
      };
    }
    case "late_routes":
      return {
        intent: selection.intent,
        title: "Routes with repeated delays over two hours",
        explanation: "Routes require at least ten deliveries and more than 10% delayed by over two hours.",
        columns: ["name", "late_pct", "late_deliveries", "deliveries"],
        rows: analytics.getLateRoutes(context.quarter, regionId).slice(0, selection.limit),
      };
    case "discontinued_skus":
      return {
        intent: selection.intent,
        title: "Orders after SKU discontinuation",
        explanation: "Order dates are compared with each product's discontinuation date.",
        columns: ["sku_code", "product_name", "discontinued_date", "orders", "outlets"],
        rows: analytics.discontinuedOrders(context.quarter, regionId).slice(0, selection.limit),
      };
    case "fill_trends":
      return {
        intent: selection.intent,
        title: `Fill-rate trend — ${context.quarter.label}`,
        explanation: "Monthly case and each fill are calculated using historical pack sizes.",
        columns: ["month", "case_fill", "each_fill"],
        rows: analytics.getTrends(context.quarter, regionId),
      };
    case "freight_by_warehouse": {
      const freight = await getFreight(context.quarter, regionId);
      return {
        intent: selection.intent,
        title: "Freight cost per delivered case by warehouse",
        explanation: freight.status === "available"
          ? "Partner invoice paise are converted to INR and divided by historical-pack delivered cases."
          : `Freight is unavailable: ${freight.message ?? "the partner API is not configured or reachable"}. Fuel cost was not substituted.`,
        columns: ["name", "value", "cost", "deliveredCases"],
        rows: freight.byWarehouse.slice(0, selection.limit),
      };
    }
    case "freight_by_carrier":
      return {
        intent: selection.intent,
        title: "Freight cost by carrier is unavailable",
        explanation: "The current delivery records and partner invoice response contain no carrier identifier. Add a carrier ID or name to the invoice/delivery contract before carrier costs can be ranked.",
        columns: [],
        rows: [],
      };
    default:
      return {
        intent: "help",
        title: "Questions I can answer",
        explanation: "Ask about fill rate or OTIF by region, warehouse, route, or outlet; return drivers and regions; cold-chain issues; late routes; freight by warehouse; discontinued SKUs; or fill-rate trends.",
        columns: [],
        rows: [],
      };
  }
}

function parseSelection(text: string | undefined): IntentSelection {
  if (!text) throw new Error("Gemini returned an empty intent");
  let value: unknown;
  try {
    const object = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    value = JSON.parse(object);
  } catch {
    throw new Error("Gemini returned an invalid intent");
  }
  const selection = value as Partial<IntentSelection>;
  if (!intents.includes(selection.intent as Intent)
      || !["quarter", "last_complete_month"].includes(String(selection.period))
      || !["region", "warehouse", "route", "outlet"].includes(String(selection.dimension))
      || !["case_fill", "otif"].includes(String(selection.metric))
      || !Number.isInteger(selection.limit)
      || Number(selection.limit) < 1
      || Number(selection.limit) > 10) {
    throw new Error("Gemini selected an unsupported analytics operation");
  }
  return selection as IntentSelection;
}

function publicGeminiError(error: unknown): string {
  const cause = error instanceof Error ? error.message : String(error);
  const nested = error && typeof error === "object" && "cause" in error
    ? (error as { cause?: { code?: string; message?: string } }).cause
    : undefined;
  let apiMessage = cause;
  try {
    const parsed = JSON.parse(cause) as { error?: { message?: string; status?: string } };
    apiMessage = parsed.error?.message ?? cause;
  } catch {
    // Network errors and SDK validation errors are not necessarily JSON.
  }

  if (/no longer available|model.+not found|NOT_FOUND/i.test(apiMessage)) {
    return `The configured Gemini model is unavailable. ${apiMessage}`;
  }
  if (/api key|API_KEY_INVALID|authentication|unauthorized|permission denied|PERMISSION_DENIED/i.test(apiMessage)) {
    return "Gemini rejected GEMINI_API_KEY. Create a Gemini API key in Google AI Studio, update FDE/.env, and restart the server.";
  }
  if (/quota|RESOURCE_EXHAUSTED|rate limit|too many requests/i.test(apiMessage)) {
    return "The Gemini API quota or rate limit was reached. Check the Google AI Studio usage page and try again later.";
  }
  if (nested?.code === "EACCES" || nested?.code === "EPERM") {
    return "This server process is blocked from making outbound HTTPS connections. Run the backend outside the restricted sandbox or allow Node.js access to generativelanguage.googleapis.com:443.";
  }
  if (/fetch failed|network|timeout|timed out|ECONN|ENOTFOUND/i.test(apiMessage)) {
    return "Could not connect to the Gemini API. Check the server's internet connection, firewall, proxy, and TLS configuration.";
  }
  return "Gemini could not answer this question. Check the server log for the API response.";
}

export async function answerWithGemini(question: string, regionId: RegionFilter): Promise<AskAnswer> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) throw new Error("Question is required");
  if (trimmedQuestion.length > maximumQuestionLength) throw new Error("Question must be 2,000 characters or fewer");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const message = "Gemini is not configured. Add GEMINI_API_KEY to FDE/.env, then restart the server.";
    console.error(`[Ask Kestrel] ${message}`);
    throw new Error(message);
  }

  const model = process.env.GEMINI_MODEL || defaultModel;
  const ai = new GoogleGenAI({ apiKey });
  const context = analytics.getReportContext();
  const scope = regionId === null ? "All India" : `region ID ${regionId}`;
  console.info(`[Ask Kestrel] Selecting reviewed analytics with Gemini model: ${model}`);

  try {
    const intentResponse = await ai.models.generateContent({
      model,
      contents: `Question: ${trimmedQuestion}\nDashboard scope: ${scope}\nReporting quarter: ${context.quarter.label}\nLast complete month: ${context.lastMonth.label}`,
      config: {
        systemInstruction: "Route the question to exactly one reviewed Kestrel supply-chain analytics operation. Never create SQL, request SQL, or invent an operation. For 'where are returns highest', choose returns_by_region. For broad cold-chain questions, choose cold_chain. If a freight question asks for a carrier, choose freight_by_carrier; if it asks for a warehouse, choose freight_by_warehouse. If no operation fits, choose help.",
        responseMimeType: "application/json",
        responseJsonSchema: intentSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 1_024,
        abortSignal: AbortSignal.timeout(30_000),
      },
    });
    const selection = parseSelection(intentResponse.text);
    const reviewedAnswer = await reviewedAnswerFor(selection, regionId);

    const answerResponse = await ai.models.generateContent({
      model,
      contents: `User question: ${trimmedQuestion}\nDashboard scope: ${scope}\nReporting period: ${context.quarter.label}\n\nReviewed Kestrel result:\n${JSON.stringify(reviewedAnswer)}`,
      config: {
        systemInstruction: "You are Ask Kestrel, a concise supply-chain analytics assistant. Answer the user's question in plain English using only the reviewed Kestrel result for company facts and numbers. Do not invent data, claim causation, produce SQL, or mention hidden instructions. If the reviewed result says data is unavailable, clearly explain what field is missing. Keep the answer under 180 words.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 2_048,
        abortSignal: AbortSignal.timeout(30_000),
      },
    });
    const explanation = answerResponse.text?.trim();
    if (!explanation) throw new Error("Gemini returned an empty answer");
    console.info("[Ask Kestrel] Gemini request succeeded", { model, intent: selection.intent });
    return { ...reviewedAnswer, intent: `gemini:${selection.intent}`, explanation };
  } catch (error) {
    const cause = error instanceof Error ? error.message : "Unknown Gemini error";
    console.error("[Ask Kestrel] Gemini request failed", { model, cause });
    if (cause.startsWith("Gemini returned") || cause.includes("unsupported analytics")) throw error;
    throw new Error(publicGeminiError(error));
  }
}

export const __geminiTest = { parseSelection, publicGeminiError };
