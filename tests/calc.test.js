import test from 'node:test';
import assert from 'node:assert/strict';

import { futureValue, ruleOf72 } from '../public/js/calc/compound.js';
import { realValue } from '../public/js/calc/inflation.js';
import { capitalGainsTax } from '../public/js/calc/tax.js';
import { monthlyPayment } from '../public/js/calc/loan.js';

test('compound: lump sum only, annual compounding', () => {
  const result = futureValue({
    principal: 10000,
    monthlyContribution: 0,
    annualRatePct: 8,
    years: 10,
  });
  assert.ok(
    Math.abs(result.finalValue - 21589) <= 1,
    `expected finalValue within ±1 of 21589, got ${result.finalValue}`
  );
});

test('compound: monthly-contribution-only annuity case', () => {
  const result = futureValue({
    principal: 0,
    monthlyContribution: 100,
    annualRatePct: 6,
    years: 1,
  });
  assert.ok(
    Math.abs(result.finalValue - 1233.56) <= 1,
    `expected finalValue within ±1 of 1233.56, got ${result.finalValue}`
  );
});

test('ruleOf72: 8% doubling time', () => {
  const years = ruleOf72(8);
  assert.ok(
    Math.abs(years - 9) <= 0.1,
    `expected ruleOf72(8) within ±0.1 of 9, got ${years}`
  );
});

test('inflation: real value of 1000 after 10 years at 3%', () => {
  const value = realValue({ amount: 1000, inflationRatePct: 3, years: 10 });
  assert.ok(
    Math.abs(value - 744) <= 1,
    `expected realValue within ±1 of 744, got ${value}`
  );
});

test('tax: capital gains tax on hand-verified case', () => {
  const result = capitalGainsTax({
    initialValue: 10000,
    saleValue: 15000,
    cumulativeInflationPct: 10,
  });
  assert.equal(result.realGain, 4000);
  assert.equal(result.tax, 1000);
});

test('loan: monthly payment amortization', () => {
  const result = monthlyPayment({
    principal: 100000,
    annualRatePct: 6,
    months: 12,
  });
  assert.ok(
    Math.abs(result.monthlyPayment - 8606.64) <= 0.5,
    `expected monthlyPayment within ±0.5 of 8606.64, got ${result.monthlyPayment}`
  );
  assert.ok(
    Math.abs(result.totalInterest - 3279.68) <= 1,
    `expected totalInterest within ±1 of 3279.68, got ${result.totalInterest}`
  );
});
