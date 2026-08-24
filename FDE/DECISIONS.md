# Decisions

## Built

One professional, responsive control-tower page covering each/case fill, true OTIF, exception queues, approved-return leakage, cold-chain risk, partner freight, post-discontinuation ordering, and Gemini-assisted Ask Kestrel. Gemini selects only from an allowlist of analytics intents; Express executes reviewed functions and never generated SQL. Reviewed parameterized queries aggregate in a read-only SQLite connection. Vitest covers conversions, periods, percentages, freight normalization, DB mode, and the OTIF invariant.

## Assumptions and definitions

The reporting clock comes from `MAX(orders.order_date)` (30 Jun 2026), so the page is FY26–27 Q1 and “last month” is June—not the system date. Realized service includes DELIVERED/PARTIAL orders and excludes closed/deleted/test/migration outlets. Historical `case_pack_at_order` converts CASE/EACH. OTIF is the intersection of `delay_minutes<=0` and operationally in-full (`order_status='DELIVERED'`). This is preferable to literal 100% quantity equality, which the generated data never satisfies. Returns use APPROVED status, not the universally null approval date. Delivered value is line-derived because headers do not reconcile. Near expiry means available within 30 days of the latest snapshot. Freight only comes from the partner API.

Verified dirt: mixed/contradictory arrival timestamps; 900 signed-negative return quantities; 158 repeated outlet-name/city groups but unique codes; three active dummy outlets; 6,782 orders without delivery; return dates beyond the reporting cutoff; no multi-delivery orders in this extract; and all order headers mismatching line totals.

## Deliberately not built

No unrestricted LLM-to-SQL, source cleaning/migration, weather/holiday integrations, BazaarPulse scraping, or fuel-cost fallback. No second page or decorative chart wall. The partner’s absent executable/API contract is handled through a narrow configurable adapter and explicit unavailable state.

## With two more weeks

Agree the OTIF/in-full contract with Operations; obtain freight schema and add contract/WireMock tests; add persisted shared cache and observability; create reconciled semantic models with data-quality alerts; add drill-through and exports; add authentication/role controls; baseline KPIs and anomaly alerts; verify returns against finance ledgers.

## What breaks first at 100×

Repeated analytical CTEs and per-request SQLite concurrency become the first bottlenecks, followed by the in-process freight cache and a large delivery-ID `IN` list. I would build incremental warehouse tables/materialized aggregates, move serving to a managed analytical store, batch invoice joins into staging tables, add Redis, request tracing, and scheduled reconciliation while preserving the same metric contract.
