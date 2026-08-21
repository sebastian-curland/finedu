// screens/portfolio.js — the portfolio simulator (`#/portfolio`).
//
// mount(el): shows the active profile's virtual portfolio (store.getPortfolio):
// cash balance, holdings list (current ILS value + unrealized P&L per
// holding), a buy/sell form for the 6 supported symbols, total portfolio
// value + total P&L vs the ₪10,000 starting cash, an estimated-tax line,
// and the market data-tier badge for the quotes used on this render.
//
// Cost-basis method: AVERAGE COST (not FIFO). Each holding is stored as
// { qty, avgCostIls } — avgCostIls is the volume-weighted average ILS
// price paid per unit still held. Buying blends the new lot into the
// average; selling reduces qty but leaves avgCostIls unchanged (a partial
// sell doesn't change the cost basis of what remains). This is simpler
// than FIFO lot-tracking and is exactly what the tax-estimate formula
// needs (cost basis of *current* holdings only — realized gains from
// past sells are intentionally out of scope for the estimate).
//
// Quotes (and the USD->ILS rate) are fetched once per mount and reused
// for every buy/sell in that session — they are not re-fetched per
// transaction. This keeps a buy immediately followed by a sell of the
// same symbol exactly reversible (mod rounding) whenever the underlying
// source data hasn't changed (e.g. the static offline fallback), and
// keeps the data-tier badge stable and accurate for what was actually
// used to price every transaction shown on screen.

import * as store from '../store.js';
import { getQuote, getUsdIls } from '../market.js';

const SYMBOLS = ['SPY', 'QQQ', 'VOO', 'AGG', 'AAPL', 'MSFT'];

const SYMBOL_LABELS = {
  SPY: 'S&P 500 (SPY)',
  QQQ: 'נאסד"ק 100 (QQQ)',
  VOO: 'Vanguard S&P 500 (VOO)',
  AGG: 'איגרות חוב (AGG)',
  AAPL: 'אפל (AAPL)',
  MSFT: 'מיקרוסופט (MSFT)',
};

const TIER_BADGE = {
  live: { emoji: '🟢', label: 'נתונים חיים' },
  cache: { emoji: '🟡', label: 'נתונים שמורים' },
  offline: { emoji: '⚪', label: 'נתוני הדגמה' },
};

const STARTING_CASH = 10000;
const TAX_RATE = 0.25;

let root = null;
let mountToken = 0; // guards against a stale async load writing after unmount/remount
let profileId = null;
let quotes = {}; // symbol -> {price, changePct, currency, source}
let usdIls = { rate: 1, source: 'offline' };
let selectedSymbol = SYMBOLS[0];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return `₪${Math.round(value).toLocaleString('he-IL')}`;
}

function roundIls(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Current ILS price for a symbol, from this mount's fetched quote + rate. */
function ilsPrice(symbol) {
  const quote = quotes[symbol];
  if (!quote) return 0;
  return roundIls(quote.price * usdIls.rate);
}

/** Worst (least-fresh) tier among the given sources: offline < cache < live. */
function worstTier(sources) {
  if (sources.includes('offline')) return 'offline';
  if (sources.includes('cache')) return 'cache';
  return 'live';
}

function renderBadge(tier) {
  const info = TIER_BADGE[tier];
  return `<span class="badge-chip portfolio-badge">${info.emoji} ${info.label}</span>`;
}

function pnlClass(n) {
  if (n > 0.005) return 'portfolio-pnl-positive';
  if (n < -0.005) return 'portfolio-pnl-negative';
  return '';
}

function renderHoldingRow(symbol, qty, avgCostIls) {
  const priceIls = ilsPrice(symbol);
  const value = priceIls * qty;
  const costBasis = avgCostIls * qty;
  const pnl = value - costBasis;
  return `
    <div class="portfolio-holding-row">
      <div class="portfolio-holding-main">
        <strong>${escapeHtml(symbol)}</strong>
        <span class="portfolio-holding-qty">${qty} יח'</span>
      </div>
      <div class="portfolio-holding-values">
        <span class="portfolio-holding-value">${formatCurrency(value)}</span>
        <span class="${pnlClass(pnl)}">${formatCurrency(pnl)}</span>
      </div>
    </div>
  `;
}

function renderHistoryRow(entry) {
  const date = new Date(entry.at);
  const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('he-IL');
  const typeLabel = entry.type === 'buy' ? 'קנייה' : 'מכירה';
  const typeClass = entry.type === 'buy' ? 'portfolio-history-buy' : 'portfolio-history-sell';
  return `
    <div class="portfolio-history-row">
      <span class="${typeClass}">${typeLabel}</span>
      <span>${escapeHtml(entry.symbol)}</span>
      <span>${entry.qty} יח'</span>
      <span>${formatCurrency(entry.priceIls)}</span>
      <span class="portfolio-history-date">${dateLabel}</span>
    </div>
  `;
}

function readTradeInputs() {
  const symbolEl = root.querySelector('#trade-symbol');
  const qtyEl = root.querySelector('#trade-qty');
  const symbol = symbolEl ? symbolEl.value : selectedSymbol;
  const qtyRaw = parseInt(qtyEl && qtyEl.value, 10);
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
  const priceIls = ilsPrice(symbol);
  const cost = roundIls(priceIls * qty);
  return { symbol, qty, priceIls, cost };
}

function showTradeError(message) {
  const errorEl = root.querySelector('#trade-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearTradeError() {
  const errorEl = root.querySelector('#trade-error');
  if (errorEl) errorEl.hidden = true;
}

function updateTradePreview() {
  const previewEl = root.querySelector('#trade-preview');
  const buyBtn = root.querySelector('#trade-buy');
  const sellBtn = root.querySelector('#trade-sell');
  if (!previewEl || !buyBtn || !sellBtn) return;

  clearTradeError();
  const { symbol, qty, priceIls, cost } = readTradeInputs();
  const portfolio = store.getPortfolio(profileId);
  const held = (portfolio.holdings[symbol] && portfolio.holdings[symbol].qty) || 0;

  if (!Number.isInteger(qty) || qty < 1) {
    previewEl.textContent = 'הזינו כמות תקינה (מספר שלם, לפחות 1).';
    buyBtn.disabled = true;
    sellBtn.disabled = true;
    return;
  }

  previewEl.textContent =
    `מחיר ליחידה: ${formatCurrency(priceIls)} · סה"כ ${qty === 1 ? 'עלות/תמורה' : 'לעסקה'}: ${formatCurrency(cost)} · מוחזק כרגע: ${held} יח'`;
  buyBtn.disabled = cost > portfolio.cash + 0.005;
  sellBtn.disabled = qty > held;
}

function handleBuy() {
  const { symbol, qty, priceIls, cost } = readTradeInputs();
  if (!Number.isInteger(qty) || qty < 1) {
    showTradeError('הזינו כמות תקינה (מספר שלם, לפחות 1).');
    return;
  }
  const portfolio = store.getPortfolio(profileId);
  if (cost > portfolio.cash + 0.005) {
    showTradeError('אין מספיק מזומן לביצוע הקנייה.');
    return;
  }

  const holdings = { ...portfolio.holdings };
  const existing = holdings[symbol];
  const newQty = (existing ? existing.qty : 0) + qty;
  const newAvgCost = existing
    ? (existing.qty * existing.avgCostIls + qty * priceIls) / newQty
    : priceIls;
  holdings[symbol] = { qty: newQty, avgCostIls: roundIls(newAvgCost) };

  const cash = roundIls(portfolio.cash - cost);
  const history = [...(portfolio.history || []), { type: 'buy', symbol, qty, priceIls, at: new Date().toISOString() }];

  store.updatePortfolio(profileId, { cash, holdings, history });
  selectedSymbol = symbol;
  render();
}

function handleSell() {
  const { symbol, qty, priceIls, cost } = readTradeInputs();
  if (!Number.isInteger(qty) || qty < 1) {
    showTradeError('הזינו כמות תקינה (מספר שלם, לפחות 1).');
    return;
  }
  const portfolio = store.getPortfolio(profileId);
  const existing = portfolio.holdings[symbol];
  const heldQty = existing ? existing.qty : 0;
  if (qty > heldQty) {
    showTradeError('אין מספיק יחידות מוחזקות למכירה.');
    return;
  }

  const holdings = { ...portfolio.holdings };
  const remainingQty = heldQty - qty;
  if (remainingQty > 0) {
    holdings[symbol] = { qty: remainingQty, avgCostIls: existing.avgCostIls };
  } else {
    delete holdings[symbol];
  }

  const cash = roundIls(portfolio.cash + cost);
  const history = [...(portfolio.history || []), { type: 'sell', symbol, qty, priceIls, at: new Date().toISOString() }];

  store.updatePortfolio(profileId, { cash, holdings, history });
  selectedSymbol = symbol;
  render();
}

function wireTradeForm() {
  const form = root.querySelector('#trade-form');
  const symbolEl = root.querySelector('#trade-symbol');
  const qtyEl = root.querySelector('#trade-qty');
  const buyBtn = root.querySelector('#trade-buy');
  const sellBtn = root.querySelector('#trade-sell');

  form.addEventListener('submit', (e) => e.preventDefault());
  symbolEl.addEventListener('change', () => {
    selectedSymbol = symbolEl.value;
    updateTradePreview();
  });
  qtyEl.addEventListener('input', updateTradePreview);
  buyBtn.addEventListener('click', handleBuy);
  sellBtn.addEventListener('click', handleSell);

  updateTradePreview();
}

function render() {
  const portfolio = store.getPortfolio(profileId);
  if (!portfolio || !root) return;

  const sources = [usdIls.source, ...SYMBOLS.map((s) => quotes[s].source)];
  const tier = worstTier(sources);

  const holdingEntries = Object.entries(portfolio.holdings || {}).filter(([, h]) => h && h.qty > 0);
  let holdingsValue = 0;
  let costBasisTotal = 0;
  const holdingsRowsHtml = holdingEntries
    .map(([symbol, h]) => {
      holdingsValue += ilsPrice(symbol) * h.qty;
      costBasisTotal += h.avgCostIls * h.qty;
      return renderHoldingRow(symbol, h.qty, h.avgCostIls);
    })
    .join('');

  const totalValue = portfolio.cash + holdingsValue;
  const totalPnl = totalValue - STARTING_CASH;
  const taxEstimate = TAX_RATE * Math.max(0, holdingsValue - costBasisTotal);

  const history = portfolio.history || [];
  const recentHistory = history.slice(-8).reverse();

  const symbolOptionsHtml = SYMBOLS.map(
    (s) => `<option value="${s}"${s === selectedSymbol ? ' selected' : ''}>${escapeHtml(SYMBOL_LABELS[s])} — ${formatCurrency(ilsPrice(s))}</option>`
  ).join('');

  root.innerHTML = `
    <div class="screen-portfolio">
      <h1>סימולטור תיק השקעות</h1>

      <div class="card portfolio-summary">
        ${renderBadge(tier)}
        <div class="portfolio-summary-row">
          <span class="portfolio-summary-label">מזומן</span>
          <span class="portfolio-summary-value">${formatCurrency(portfolio.cash)}</span>
        </div>
        <div class="portfolio-summary-row">
          <span class="portfolio-summary-label">שווי אחזקות</span>
          <span class="portfolio-summary-value">${formatCurrency(holdingsValue)}</span>
        </div>
        <div class="portfolio-summary-row">
          <span class="portfolio-summary-label">שווי תיק כולל</span>
          <span class="portfolio-summary-value">${formatCurrency(totalValue)}</span>
        </div>
        <div class="portfolio-summary-row">
          <span class="portfolio-summary-label">רווח/הפסד כולל (מול ₪${STARTING_CASH.toLocaleString('he-IL')} התחלתי)</span>
          <span class="portfolio-summary-value ${pnlClass(totalPnl)}">${formatCurrency(totalPnl)}</span>
        </div>
        <div class="portfolio-summary-row portfolio-tax-row">
          <span class="portfolio-summary-label">הערכת מס משוערת (על רווח לא ממומש באחזקות הנוכחיות)</span>
          <span class="portfolio-summary-value">${formatCurrency(taxEstimate)}</span>
        </div>
      </div>

      <div class="card portfolio-holdings">
        <h2>אחזקות</h2>
        ${holdingEntries.length ? `<div class="portfolio-holding-list">${holdingsRowsHtml}</div>` : '<p class="portfolio-empty">אין אחזקות עדיין — קנו כמה יחידות למטה כדי להתחיל.</p>'}
      </div>

      <div class="card portfolio-trade">
        <h2>קנייה / מכירה</h2>
        <form class="tool-form" id="trade-form" novalidate>
          <div class="field">
            <label class="label" for="trade-symbol">נייר ערך</label>
            <select class="select" id="trade-symbol">${symbolOptionsHtml}</select>
          </div>
          <div class="field">
            <label class="label" for="trade-qty">כמות</label>
            <input class="input" type="number" inputmode="numeric" id="trade-qty" min="1" step="1" value="1">
          </div>
          <p class="portfolio-trade-preview" id="trade-preview"></p>
          <p class="tool-inline-error" id="trade-error" hidden></p>
          <div class="portfolio-trade-actions">
            <button type="button" class="btn btn-primary" id="trade-buy">קנייה</button>
            <button type="button" class="btn btn-secondary" id="trade-sell">מכירה</button>
          </div>
        </form>
      </div>

      <div class="card portfolio-history">
        <h2>עסקאות אחרונות</h2>
        ${recentHistory.length ? `<div class="portfolio-history-list">${recentHistory.map(renderHistoryRow).join('')}</div>` : '<p class="portfolio-empty">אין עדיין עסקאות.</p>'}
      </div>
    </div>
  `;

  wireTradeForm();
}

async function load(token) {
  const profile = store.getActiveProfile();
  if (!profile || !root) return; // main.js's route guard should prevent this, but be defensive
  profileId = profile.id;

  const [usdIlsResult, ...quoteResults] = await Promise.all([getUsdIls(), ...SYMBOLS.map((s) => getQuote(s))]);
  if (token !== mountToken || !root) return; // unmounted/remounted while loading

  usdIls = usdIlsResult;
  quotes = Object.fromEntries(SYMBOLS.map((s, i) => [s, quoteResults[i]]));

  render();
}

export function mount(el) {
  root = el;
  mountToken += 1;
  const token = mountToken;
  selectedSymbol = SYMBOLS[0];

  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">⏳</p>
      <p>טוען נתוני שוק…</p>
    </div>
  `;

  load(token);
}

export function unmount() {
  mountToken += 1; // invalidate any in-flight load()
  root = null;
}
