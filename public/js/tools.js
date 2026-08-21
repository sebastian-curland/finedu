// tools.js — the four financial calculators + the tools list screen.
//
// Lives at public/js/tools.js (not screens/) because screens/lesson.js
// (Task 3) already calls `import('../tools.js').then(m => m.renderInline(...))`
// — that relative path resolves here, and this file's renderInline() is the
// contract it depends on. main.js imports this same module (as './tools.js')
// for the `#/tools` and `#/tools/:toolId` routes, using its mount/unmount.
//
// Dual interface:
//  - mount(el, {toolId}): full-page screen. No toolId -> grid/list of the
//    4 calculators + a 5th card linking to #/portfolio. A toolId -> that
//    one calculator full-page (title + back link + form/result).
//  - renderInline(toolId, container): just the form+result for one
//    calculator, no page chrome — used to embed a calculator inside a
//    lesson's {type:'tool'} block.
//
// Each calculator is a self-contained render(container) function: builds
// its form + result markup, wires a live 'input' listener that reads the
// form and re-renders the result (and, for compound, a chart.js line
// chart) on every keystroke. No submit button — but submit is still
// prevented so Enter in a number field doesn't reload the page.

import { lineChart } from './chart.js';
import { futureValue } from './calc/compound.js';
import { realValue } from './calc/inflation.js';
import { capitalGainsTax } from './calc/tax.js';
import { monthlyPayment } from './calc/loan.js';

let root = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(n) {
  const rounded = Math.round(Number(n) || 0);
  return `₪${rounded.toLocaleString('he-IL')}`;
}

function num(container, id, fallback = 0) {
  const el = container.querySelector(`#${id}`);
  const value = parseFloat(el && el.value);
  return Number.isFinite(value) ? value : fallback;
}

function int(container, id, fallback = 0) {
  const el = container.querySelector(`#${id}`);
  const value = parseInt(el && el.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

/** Wires an already-rendered .tool-form to call `recalc` on input/submit, then runs it once. */
function wireForm(container, recalc) {
  const form = container.querySelector('.tool-form');
  form.addEventListener('input', recalc);
  form.addEventListener('submit', (e) => e.preventDefault());
  recalc();
}

/* --- מחשבון ריבית דריבית (compound) ------------------------------------- */

function renderCompoundCalculator(container) {
  container.innerHTML = `
    <form class="tool-form" novalidate>
      <div class="field">
        <label class="label" for="compound-principal">סכום התחלתי (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="compound-principal" min="0" step="1" value="10000">
      </div>
      <div class="field">
        <label class="label" for="compound-contribution">הפקדה חודשית (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="compound-contribution" min="0" step="1" value="0">
      </div>
      <div class="field">
        <label class="label" for="compound-rate">ריבית שנתית (%)</label>
        <input class="input" type="number" inputmode="decimal" id="compound-rate" min="0" step="0.1" value="8">
      </div>
      <div class="field">
        <label class="label" for="compound-years">שנים</label>
        <input class="input" type="number" inputmode="decimal" id="compound-years" min="1" max="60" step="1" value="10">
      </div>
      <label class="tool-checkbox-field" for="compound-compare">
        <input type="checkbox" id="compound-compare">
        <span>השוואה: מתחילים היום מול מתחילים בעוד 10 שנים</span>
      </label>
    </form>
    <div class="tool-result card">
      <div class="tool-result-row">
        <span class="tool-result-label">שווי סופי</span>
        <span class="tool-result-value" id="compound-final"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">סה"כ הופקד</span>
        <span class="tool-result-value" id="compound-deposited"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">רווח</span>
        <span class="tool-result-value" id="compound-profit"></span>
      </div>
      <div class="tool-chart" id="compound-chart"></div>
      <div class="tool-compare" id="compound-compare-result" hidden>
        <div class="tool-compare-card">
          <div class="tool-compare-title">מתחילים היום</div>
          <div class="tool-compare-value" id="compound-compare-today"></div>
        </div>
        <div class="tool-compare-card">
          <div class="tool-compare-title">מתחילים בעוד 10 שנים</div>
          <div class="tool-compare-value" id="compound-compare-wait"></div>
        </div>
      </div>
    </div>
  `;

  const chartEl = container.querySelector('#compound-chart');
  const compareToggle = container.querySelector('#compound-compare');
  const compareResult = container.querySelector('#compound-compare-result');

  function readBase() {
    return {
      principal: Math.max(0, num(container, 'compound-principal', 0)),
      monthlyContribution: Math.max(0, num(container, 'compound-contribution', 0)),
      annualRatePct: num(container, 'compound-rate', 0),
      years: Math.max(1, int(container, 'compound-years', 1)),
    };
  }

  function recalc() {
    const base = readBase();
    const result = futureValue(base);

    container.querySelector('#compound-final').textContent = formatCurrency(result.finalValue);
    container.querySelector('#compound-deposited').textContent = formatCurrency(result.totalDeposited);
    container.querySelector('#compound-profit').textContent = formatCurrency(result.profit);

    const points = [];
    for (let y = 0; y <= base.years; y++) {
      points.push({ x: y, y: futureValue({ ...base, years: y }).finalValue });
    }
    lineChart(chartEl, points, { width: 320, height: 160, labelFormatter: formatCurrency });

    compareResult.hidden = !compareToggle.checked;
    if (compareToggle.checked) {
      // "start today" is exactly `base` as already computed into `result`
      // above (years unchanged) — no need to recompute it.
      const startIn10 = futureValue({ ...base, years: Math.max(0, base.years - 10) });
      container.querySelector('#compound-compare-today').textContent = formatCurrency(result.finalValue);
      container.querySelector('#compound-compare-wait').textContent = formatCurrency(startIn10.finalValue);
    }
  }

  wireForm(container, recalc);
}

/* --- מחשבון אינפלציה (inflation) ----------------------------------------- */

function renderInflationCalculator(container) {
  container.innerHTML = `
    <form class="tool-form" novalidate>
      <div class="field">
        <label class="label" for="inflation-amount">סכום (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="inflation-amount" min="0" step="1" value="1000">
      </div>
      <div class="field">
        <label class="label" for="inflation-rate">אינפלציה שנתית (%)</label>
        <input class="input" type="number" inputmode="decimal" id="inflation-rate" min="0" step="0.1" value="3">
      </div>
      <div class="field">
        <label class="label" for="inflation-years">שנים</label>
        <input class="input" type="number" inputmode="decimal" id="inflation-years" min="1" max="60" step="1" value="10">
      </div>
    </form>
    <div class="tool-result card">
      <div class="tool-result-row">
        <span class="tool-result-label">ערך ריאלי (בכוח קנייה של היום)</span>
        <span class="tool-result-value" id="inflation-real"></span>
      </div>
    </div>
  `;

  function recalc() {
    const amount = Math.max(0, num(container, 'inflation-amount', 0));
    const inflationRatePct = num(container, 'inflation-rate', 0);
    const years = Math.max(1, int(container, 'inflation-years', 1));
    const value = realValue({ amount, inflationRatePct, years });
    container.querySelector('#inflation-real').textContent = formatCurrency(value);
  }

  wireForm(container, recalc);
}

/* --- מחשבון מס רווחי הון (tax) ------------------------------------------- */

function renderTaxCalculator(container) {
  container.innerHTML = `
    <form class="tool-form" novalidate>
      <div class="field">
        <label class="label" for="tax-initial">שווי התחלתי (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="tax-initial" min="0" step="1" value="10000">
      </div>
      <div class="field">
        <label class="label" for="tax-sale">שווי מכירה (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="tax-sale" min="0" step="1" value="15000">
      </div>
      <div class="field">
        <label class="label" for="tax-inflation">אינפלציה מצטברת (%)</label>
        <input class="input" type="number" inputmode="decimal" id="tax-inflation" min="0" step="0.1" value="10">
      </div>
    </form>
    <div class="tool-result card">
      <div class="tool-result-row">
        <span class="tool-result-label">רווח נומינלי</span>
        <span class="tool-result-value" id="tax-nominal"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">רווח ריאלי</span>
        <span class="tool-result-value" id="tax-real"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">מס</span>
        <span class="tool-result-value" id="tax-tax"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">נטו ביד</span>
        <span class="tool-result-value" id="tax-net"></span>
      </div>
    </div>
  `;

  function recalc() {
    const initialValue = Math.max(0, num(container, 'tax-initial', 0));
    const saleValue = Math.max(0, num(container, 'tax-sale', 0));
    const cumulativeInflationPct = num(container, 'tax-inflation', 0);
    const result = capitalGainsTax({ initialValue, saleValue, cumulativeInflationPct });

    container.querySelector('#tax-nominal').textContent = formatCurrency(result.nominalGain);
    container.querySelector('#tax-real').textContent = formatCurrency(result.realGain);
    container.querySelector('#tax-tax').textContent = formatCurrency(result.tax);
    container.querySelector('#tax-net').textContent = formatCurrency(result.netGain);
  }

  wireForm(container, recalc);
}

/* --- מחשבון הלוואה (loan) ------------------------------------------------- */

function renderLoanCalculator(container) {
  container.innerHTML = `
    <form class="tool-form" novalidate>
      <div class="field">
        <label class="label" for="loan-principal">סכום הלוואה (₪)</label>
        <input class="input" type="number" inputmode="decimal" id="loan-principal" min="0" step="1" value="100000">
      </div>
      <div class="field">
        <label class="label" for="loan-rate">ריבית שנתית (%)</label>
        <input class="input" type="number" inputmode="decimal" id="loan-rate" min="0" step="0.1" value="6">
      </div>
      <div class="field">
        <label class="label" for="loan-months">מספר חודשים</label>
        <input class="input" type="number" inputmode="decimal" id="loan-months" min="1" step="1" value="12">
      </div>
    </form>
    <div class="tool-result card">
      <div class="tool-result-row">
        <span class="tool-result-label">תשלום חודשי</span>
        <span class="tool-result-value" id="loan-payment"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">סה"כ תשלום</span>
        <span class="tool-result-value" id="loan-total"></span>
      </div>
      <div class="tool-result-row">
        <span class="tool-result-label">סה"כ ריבית</span>
        <span class="tool-result-value" id="loan-interest"></span>
      </div>
    </div>
  `;

  function recalc() {
    const principal = Math.max(0, num(container, 'loan-principal', 0));
    const annualRatePct = num(container, 'loan-rate', 0);
    const months = Math.max(1, int(container, 'loan-months', 1));
    const result = monthlyPayment({ principal, annualRatePct, months });

    container.querySelector('#loan-payment').textContent = formatCurrency(result.monthlyPayment);
    container.querySelector('#loan-total').textContent = formatCurrency(result.totalPaid);
    container.querySelector('#loan-interest').textContent = formatCurrency(result.totalInterest);
  }

  wireForm(container, recalc);
}

/* --- registry + list/page chrome ------------------------------------------ */

const TOOL_LIST = [
  { id: 'compound', emoji: '📈', title: 'מחשבון ריבית דריבית', desc: 'כמה יגדל הכסף שלכם עם הזמן' },
  { id: 'inflation', emoji: '💸', title: 'מחשבון אינפלציה', desc: 'כמה שווה הכסף שלכם בעתיד' },
  { id: 'tax', emoji: '🧾', title: 'מחשבון מס רווחי הון', desc: 'כמה מס משלמים כשמוכרים השקעה' },
  { id: 'loan', emoji: '🏦', title: 'מחשבון הלוואה', desc: 'כמה עולה להחזיר הלוואה כל חודש' },
];

const CALCULATORS = {
  compound: renderCompoundCalculator,
  inflation: renderInflationCalculator,
  tax: renderTaxCalculator,
  loan: renderLoanCalculator,
};

const TOOL_TITLES = Object.fromEntries(TOOL_LIST.map((t) => [t.id, t.title]));

function renderToolListHtml() {
  const cards = TOOL_LIST.map(
    (t) => `
      <li>
        <a class="card tool-card" href="#/tools/${encodeURIComponent(t.id)}">
          <span class="tool-card-emoji" aria-hidden="true">${t.emoji}</span>
          <span class="tool-card-info">
            <strong class="tool-card-title">${escapeHtml(t.title)}</strong>
            <span class="tool-card-desc">${escapeHtml(t.desc)}</span>
          </span>
        </a>
      </li>
    `
  ).join('');

  return `
    <div class="screen-tools">
      <h1>כלים</h1>
      <ul class="tools-list">
        ${cards}
        <li>
          <a class="card tool-card" href="#/portfolio">
            <span class="tool-card-emoji" aria-hidden="true">💼</span>
            <span class="tool-card-info">
              <strong class="tool-card-title">סימולטור תיק השקעות</strong>
              <span class="tool-card-desc">נסו לבנות תיק השקעות משלכם</span>
            </span>
          </a>
        </li>
      </ul>
    </div>
  `;
}

function renderNotFound() {
  root.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-emoji" aria-hidden="true">🔍</p>
      <h2>הכלי לא נמצא</h2>
      <a class="btn btn-secondary" href="#/tools">חזרה לכלים</a>
    </div>
  `;
}

export function mount(el, params) {
  root = el;
  const toolId = params && params.toolId;

  if (!toolId) {
    root.innerHTML = renderToolListHtml();
    return;
  }

  const renderCalculator = CALCULATORS[toolId];
  if (!renderCalculator) {
    renderNotFound();
    return;
  }

  root.innerHTML = `
    <div class="screen-tool">
      <a class="lesson-back" href="#/tools">כלים</a>
      <h1>${escapeHtml(TOOL_TITLES[toolId])}</h1>
      <div class="tool-body" id="tool-body"></div>
    </div>
  `;
  renderCalculator(root.querySelector('#tool-body'));
}

export function unmount() {
  root = null;
}

/** Renders just the form+result for one calculator into an arbitrary container — no page chrome. Used by screens/lesson.js for {type:'tool'} blocks. */
export function renderInline(toolId, container) {
  if (!container) return;
  const renderCalculator = CALCULATORS[toolId];
  if (!renderCalculator) {
    container.innerHTML = `<p class="tool-inline-error">הכלי "${escapeHtml(String(toolId))}" לא נמצא.</p>`;
    return;
  }
  renderCalculator(container);
}
