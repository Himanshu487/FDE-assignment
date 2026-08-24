import { describe, expect, it } from "vitest";
import { __geminiTest, reviewedAnswerFor } from "../src/services/gemini.js";

const selection = {
  intent: "service_breakdown" as const,
  period: "quarter" as const,
  dimension: "warehouse" as const,
  metric: "otif" as const,
  limit: 5,
};

describe("Gemini analytics guardrails", () => {
  it("accepts only a complete allowlisted intent", () => {
    expect(__geminiTest.parseSelection(JSON.stringify(selection))).toEqual(selection);
    expect(__geminiTest.parseSelection(`Here is the selection:\n\`\`\`json\n${JSON.stringify(selection)}\n\`\`\``)).toEqual(selection);
    expect(() => __geminiTest.parseSelection(JSON.stringify({ ...selection, intent: "run_sql", sql: "DROP TABLE orders" }))).toThrow("unsupported analytics operation");
  });

  it("turns model retirement into an actionable error", () => {
    const error = new Error(JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "This model is no longer available. Use gemini-3.6-flash." } }));
    expect(__geminiTest.publicGeminiError(error)).toContain("configured Gemini model is unavailable");
    expect(__geminiTest.publicGeminiError(error)).toContain("gemini-3.6-flash");
  });

  it("identifies an outbound network sandbox", () => {
    const error = new TypeError("fetch failed", { cause: Object.assign(new Error("connect EACCES"), { code: "EACCES" }) });
    expect(__geminiTest.publicGeminiError(error)).toContain("blocked from making outbound HTTPS connections");
  });

  it("ranks the reviewed warehouse OTIF result without generated SQL", async () => {
    const answer = await reviewedAnswerFor(selection, null);
    const values = answer.rows.map(row => Number(row.otif));
    expect(answer.title).toContain("OTIF by warehouse");
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  }, 30_000);

  it("reports the missing carrier field instead of inventing carrier costs", async () => {
    const answer = await reviewedAnswerFor({ ...selection, intent: "freight_by_carrier" }, null);
    expect(answer.rows).toEqual([]);
    expect(answer.explanation).toContain("no carrier identifier");
  }, 30_000);
});
