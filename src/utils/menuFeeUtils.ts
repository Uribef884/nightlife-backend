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

/**
 * Unified menu purchase fee calculator
 */
export function calculateMenuFees(
  totalPaid: number,
  paymentMethod: string,
  platformFeeApplied: number
): {
  platformReceives: number;
  clubReceives: number;
  gatewayFee: number;
  gatewayIVA: number;
  retentionFuente: number | null;
  retentionICA: number | null;
  retentionIVA: number | null;
} {
  const platformReceives = calculatePlatformFee(totalPaid, platformFeeApplied);
  const gateway = calculateGatewayFees(totalPaid);

  const clubReceives = totalPaid - platformReceives;

  if (paymentMethod === "wompi") {
    return {
      platformReceives,
      clubReceives,
      gatewayFee: gateway.totalGatewayFee,
      gatewayIVA: gateway.iva,
      retentionFuente: 0,
      retentionICA: 0,
      retentionIVA: 0,
    };
  }

  return {
    platformReceives,
    clubReceives,
    gatewayFee: 0,
    gatewayIVA: 0,
    retentionFuente: null,
    retentionICA: null,
    retentionIVA: null,
  };
}
