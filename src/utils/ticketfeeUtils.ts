export function calculatePlatformFee(basePrice: number, percent: number): number {
  return Math.round(basePrice * percent * 100) / 100;
}

export function calculateGatewayFees(basePrice: number): {
  totalGatewayFee: number;
  iva: number;
} {
  const fixed = 700;  // Fixed fee in COP Wompi
  const variable = basePrice * 0.0265; // Variable fee 2.65% of the base price Wompi  
  const subtotal = fixed + variable;
  const iva = subtotal * 0.19; // IVA 19% on the subtotal Wompi

  return {
    totalGatewayFee: Math.round(subtotal * 100) / 100,
    iva: Math.round(iva * 100) / 100,
  };
}