// market.js — three-tier market data resolution: live fetch -> cached
// live value -> bundled offline fallback. This is the only module that
// should fetch quotes/rates or read the market cache keys; other modules
// (Task 9's portfolio simulator, etc.) call getQuote()/getUsdIls() here.
//
// Tier 1 (live): getQuote() only attempts this when config.js has a
// Twelve Data API key configured. getUsdIls() always attempts its
// (keyless) Frankfurter call, regardless of whether a Twelve Data key is
// configured — per spec, that call needs no key so there's no reason to
// skip it.
// Tier 2 (cache): store.cacheGet() with a 6h TTL, populated by a prior
// successful tier-1 fetch (so a stale-but-recent live value beats the
// bundled fallback).
// Tier 3 (offline): data/market-fallback.js's bundled demo values.
//
// store.js is the only module allowed to touch localStorage — this
// module only ever reaches the cache via store.cacheGet/cacheSet, never
// localStorage directly.

import { TWELVE_DATA_API_KEY } from '../config.js';
import { cacheGet, cacheSet } from './store.js';
import { PRICES, USD_ILS_FALLBACK } from './data/market-fallback.js';

const CACHE_TTL_MS = 21600000; // 6h
const FETCH_TIMEOUT_MS = 5000;

/**
 * AbortSignal.timeout() when the runtime supports it (Node 20+, modern
 * browsers), else undefined — fetch() just runs without an abort signal.
 */
function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/**
 * @param {string} symbol e.g. 'SPY'
 * @returns {Promise<{price:number, changePct:number, currency:string, source:'live'|'cache'|'offline'}>}
 */
export async function getQuote(symbol) {
  const cacheKey = `quote:${symbol}`;

  if (TWELVE_DATA_API_KEY) {
    try {
      // /quote (not /price): /price only returns a raw number with no
      // percent-change or currency field, which would force changePct/
      // currency to be fabricated under a source:'live' label. /quote has
      // the same CORS-friendly behavior and returns real percent_change +
      // currency fields alongside the price (as "close" — /quote has no
      // "price" field; "close" is its current/last-traded price).
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
      const res = await fetch(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS) });
      if (res.ok) {
        const data = await res.json();
        // Twelve Data returns numeric fields as strings; coerce explicitly.
        const price = Number(data.close);
        const changePct = Number(data.percent_change);
        if (Number.isFinite(price) && Number.isFinite(changePct)) {
          const value = { price, changePct, currency: data.currency || 'USD' };
          cacheSet(cacheKey, value);
          return { ...value, source: 'live' };
        }
      }
    } catch (err) {
      // Network failure, timeout, or bad response — fall through to the
      // cache/offline tiers below.
    }
  }

  const cached = cacheGet(cacheKey, CACHE_TTL_MS);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  const fallback = PRICES[symbol];
  if (fallback) {
    return { ...fallback, source: 'offline' };
  }
  // Unknown symbol with nothing cached: still return a well-formed object.
  return { price: 0, changePct: 0, currency: 'USD', source: 'offline' };
}

/**
 * @returns {Promise<{rate:number, source:'live'|'cache'|'offline'}>}
 */
export async function getUsdIls() {
  const cacheKey = 'usdils';

  try {
    const url = 'https://api.frankfurter.dev/v1/latest?from=USD&to=ILS';
    const res = await fetch(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS) });
    if (res.ok) {
      const data = await res.json();
      const rate = data && data.rates ? parseFloat(data.rates.ILS) : NaN;
      if (Number.isFinite(rate)) {
        cacheSet(cacheKey, { rate });
        return { rate, source: 'live' };
      }
    }
  } catch (err) {
    // Network failure or timeout — fall through to the cache/offline tiers.
  }

  const cached = cacheGet(cacheKey, CACHE_TTL_MS);
  if (cached) {
    return { rate: cached.rate, source: 'cache' };
  }

  return { rate: USD_ILS_FALLBACK, source: 'offline' };
}
