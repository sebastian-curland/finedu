export function futureValue({ principal, monthlyContribution, annualRatePct, years }) {
  const annualRate = annualRatePct / 100;
  const monthlyRate = annualRate / 12;
  const months = years * 12;

  const lumpSumFV = principal * Math.pow(1 + annualRate, years);

  const contributionFV =
    monthlyRate === 0
      ? monthlyContribution * months
      : monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

  const finalValue = lumpSumFV + contributionFV;
  const totalDeposited = principal + monthlyContribution * months;
  const profit = finalValue - totalDeposited;

  return { finalValue, totalDeposited, profit };
}

export function ruleOf72(ratePct) {
  return 72 / ratePct;
}
