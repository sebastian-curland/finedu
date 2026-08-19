export function realValue({ amount, inflationRatePct, years }) {
  const rate = inflationRatePct / 100;
  return amount / Math.pow(1 + rate, years);
}
