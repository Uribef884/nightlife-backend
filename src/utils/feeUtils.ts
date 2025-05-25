export function calculatePlatformFee(basePrice: number, percent: number): number {
  return Math.round(basePrice * percent * 100) / 100;
}

export function calculateGatewayFees(basePrice: number): {
  totalGatewayFee: number;
  iva: number;
} {
  const fixed = 900; // fixed fee in COP
  const variable = basePrice * 0.05; // 5% variable fee
  const total = fixed + variable;
  const iva = total * 0.19; // 19% VAT on gateway fee

  return {
    totalGatewayFee: Math.round(total * 100) / 100,
    iva: Math.round(iva * 100) / 100,
  };
}