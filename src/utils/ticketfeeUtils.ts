import { GATEWAY_FEES } from "../config/fees";

export function calculatePlatformFee(basePrice: number, percent: number): number {
  return Math.round(basePrice * percent * 100) / 100;
}

export function calculateGatewayFees(basePrice: number): {
  totalGatewayFee: number;
  iva: number;
} {
  const fixed = GATEWAY_FEES.FIXED;
  const variable = basePrice * GATEWAY_FEES.VARIABLE;
  const subtotal = fixed + variable;
  const iva = subtotal * GATEWAY_FEES.IVA;

  return {
    totalGatewayFee: Math.round(subtotal * 100) / 100,
    iva: Math.round(iva * 100) / 100,
  };
}