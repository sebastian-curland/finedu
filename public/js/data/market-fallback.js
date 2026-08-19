// market-fallback.js — bundled, no-network seed data for market.js's
// offline tier. Values are plausible demo figures (not live market data)
// so the app always has *something* well-formed to show when there's no
// API key configured, no cached live value, and no network access.
//
// market.js imports this data; this file must never import market.js
// (would create a cycle) — it's pure, static data only.

/** @type {Record<string, {price:number, changePct:number, currency:'USD'}>} */
export const PRICES = {
  SPY: { price: 560.25, changePct: 0.42, currency: 'USD' },
  QQQ: { price: 481.10, changePct: 0.65, currency: 'USD' },
  VOO: { price: 515.80, changePct: 0.41, currency: 'USD' },
  AGG: { price: 98.15, changePct: -0.08, currency: 'USD' },
  AAPL: { price: 228.50, changePct: 1.12, currency: 'USD' },
  MSFT: { price: 431.90, changePct: -0.35, currency: 'USD' },
};

/** Fallback USD->ILS rate used when no live/cached rate is available. */
export const USD_ILS_FALLBACK = 3.65;

/**
 * Short illustrative TA-35 index history for demo charts (world 1/2
 * context). Not precise real data — just plausible-looking points.
 * @type {{date:string, value:number}[]}
 */
export const TA35_HISTORY = [
  { date: '2026-02-16', value: 1985 },
  { date: '2026-03-16', value: 2010 },
  { date: '2026-04-16', value: 1972 },
  { date: '2026-05-16', value: 2040 },
  { date: '2026-06-16', value: 2065 },
  { date: '2026-07-16', value: 2088 },
  { date: '2026-08-16', value: 2102 },
];
