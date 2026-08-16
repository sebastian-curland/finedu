function monthlyPayment({ principal, annualRatePct, months }) {
  const monthlyRate = annualRatePct / 100 / 12;

  const payment =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);

  const totalPaid = payment * months;
  const totalInterest = totalPaid - principal;

  return { monthlyPayment: payment, totalPaid, totalInterest };
}

module.exports = { monthlyPayment };
