function capitalGainsTax({ initialValue, saleValue, cumulativeInflationPct }) {
  const adjustedBasis = initialValue * (1 + cumulativeInflationPct / 100);
  const nominalGain = saleValue - initialValue;
  const realGain = Math.max(0, saleValue - adjustedBasis);
  const tax = realGain * 0.25;
  const netGain = saleValue - initialValue - tax;

  return { nominalGain, realGain, tax, netGain };
}

module.exports = { capitalGainsTax };
