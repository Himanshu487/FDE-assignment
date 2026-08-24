# Kestrel Supply Chain Control Tower

A lightweight operations control tower for Kestrel Provisions.

It brings service performance, operational exceptions, returns, cold-chain issues and freight costs into one view, with the aim of making one question easier to answer:

**Where are we losing service, and where are we losing money?**

The default view covers **FY 2026–27 Q1 (Apr–Jun 2026)**.

## Overview

The control tower currently covers:

- Case and each fill rate
- On-Time-In-Full (OTIF)
- Service performance across regions, warehouses, routes and outlets
- Worst-performing outlets and routes
- Returns and credit-note leakage
- Cold-chain exceptions and near-expiry inventory
- Freight cost per delivered case
- Plain-English operational queries through Ask Kestrel

The dashboard is intentionally exception-first. The most important problems are surfaced on the main view instead of being buried behind multiple reports.

## Tech Stack

**Frontend**
- React
- TypeScript
- Vite
- Recharts

**Backend**
- Node.js
- Express
- TypeScript
- SQLite (`better-sqlite3`)
- Google Gen AI SDK (`@google/genai`)

**Testing**
- Vitest

The operational SQLite database is opened in read-only mode and is never modified by the application.

## Getting Started

### Requirements

- Node.js 20+
- `kestrel_ops.db`

Place the database at:

```text
data/kestrel_ops.db
```

Then run:

```bash
npm install
npm run dev
```

The application will be available at:

```text
Dashboard: http://localhost:5173
API:       http://localhost:4000
```

To run the tests:

```bash
npm test
```

To create a production build:

```bash
npm run build
```

## Freight Integration

Freight cost comes from the logistics partner API rather than `deliveries.fuel_cost_inr`, since the latter is driver-entered and does not represent the billed carrier amount.

Configure the integration through `.env`:

```env
PARTNER_FREIGHT_API_URL=http://localhost:8088/invoices
PARTNER_FREIGHT_API_KEY=<api-key>
```

The integration handles pagination, rate limits, temporary service failures and paise-to-INR conversion.

If the partner service is unavailable, freight is shown as unavailable while the rest of the control tower continues to work.

## Metric Definitions

### Fill Rate

Both **case fill rate** and **each fill rate** are reported.

Quantities are normalised using `case_pack_at_order`, which preserves the pack configuration that existed when the order was placed.

```text
Each Fill Rate = Delivered Each Equivalents / Ordered Each Equivalents

Case Fill Rate = Delivered Case Equivalents / Ordered Case Equivalents
```

Service calculations include `DELIVERED` and `PARTIAL` orders. Cancelled/open orders and closed, deleted or identified test outlets are excluded.

### OTIF

OTIF represents orders that are both **on time and in full**.

For the current data:

```text
On Time = delay_minutes <= 0
In Full = order_status = DELIVERED
```

The calculation is performed at order level for eligible orders with a delivery record.

### Returns

Only approved credit notes are treated as realised return leakage.

Delivered value is calculated from line-level quantities and prices rather than relying on order-header values that do not consistently reconcile with the underlying lines.

### Cold Chain

Cold-chain monitoring includes:

- Temperature excursions per 100 chilled deliveries
- Near-expiry available inventory
- Credit-note value associated with chilled products

For the current view, inventory expiring within **30 days** of the latest available inventory snapshot is considered near expiry.

### Freight

Freight cost per delivered case is calculated using carrier invoice value from the logistics partner API and the corresponding delivered case-equivalent quantity.

Driver-entered fuel cost is not used as a substitute when invoice data is unavailable.

## Ask Kestrel

Ask Kestrel provides a simple way to query the operational data without navigating through individual reports.

Examples:

```text
Which warehouse had the worst OTIF in Q1?
Which region has the lowest fill rate?
What are the biggest cold-chain issues?
Which carrier has the highest freight cost?
Where are the highest returns?
```

Ask Kestrel sends the user's question to Gemini from the Express server, never from the browser. Add your Gemini API key to `.env` (which must not be committed):

```env
GEMINI_API_KEY=<your-api-key>
# Optional. Defaults to gemini-2.5-flash.
GEMINI_MODEL=gemini-3.6-flash
```

Gemini first selects one operation from an allowlist of reviewed analytics functions. Express runs that function with fixed parameters, then supplies its result to Gemini for a concise answer. Gemini cannot submit SQL, and SQLite remains read-only. If no Gemini key is configured, Ask Kestrel shows a configuration error rather than silently returning a non-AI fallback. The default is `gemini-3.6-flash`; Google no longer makes `gemini-2.5-flash` available to new users.

The existing Plain-English Question Box calls `POST /api/chat` (`POST /api/ask` remains as a compatibility alias). When the server starts, its terminal prints whether Gemini is configured. Ask Kestrel also shows a visible error in the dashboard and a detailed server-console error if the key, model, or API request fails.

The current delivery and partner-invoice data has no carrier identifier, so carrier-ranking questions explicitly report that limitation instead of fabricating a carrier result. Warehouse freight ranking remains available.

## Data Notes

A few source-data issues are accounted for in the analytics layer:

- Quantities are recorded in both CASE and EACH
- Test and migration outlets exist in the outlet master
- Delivery timestamps are not consistently formatted across telematics sources
- Return quantity signs differ between upstream sources
- Credit-note approval dates are not populated consistently
- Some order-header financial values do not reconcile with line-level values

The source data itself is left unchanged.

## Project Structure

```text
├── client/                 React dashboard
├── server/                 Express API
│   └── src/
│       └── services/
│           ├── analytics.ts
│           ├── ask.ts
│           ├── gemini.ts
│           └── freight.ts
├── data/                   Local operational database
├── tests/
├── README.md
└── DECISIONS.md
```

More detail on metric assumptions, scope choices, production considerations and next steps is available in [`DECISIONS.md`](./DECISIONS.md).

> `data/kestrel_ops.db` is intentionally excluded from version control.
