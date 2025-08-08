/**
 * Wompi Configuration
 * 
 * This file contains all Wompi-related settings, URLs, and key management.
 * Environment variables should be set in .env file:
 * - WOMPI_PRIVATE_KEY_SANDBOX
 * - WOMPI_PRIVATE_KEY_PRODUCTION
 * - WOMPI_PUBLIC_KEY_SANDBOX
 * - WOMPI_PUBLIC_KEY_PRODUCTION
 * - WOMPI_INTEGRITY_KEY_SANDBOX
 * - WOMPI_INTEGRITY_KEY_PRODUCTION
 * - WOMPI_ENVIRONMENT (sandbox|production)
 */

export const WOMPI_CONFIG = {
  // Environment
  ENVIRONMENT: process.env.WOMPI_ENVIRONMENT || 'sandbox',
  
  // Base URLs
  BASE_URL: process.env.WOMPI_ENVIRONMENT === 'production' 
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1',
  
  // Keys
  PRIVATE_KEY: process.env.WOMPI_ENVIRONMENT === 'production'
    ? process.env.WOMPI_PRIVATE_KEY_PRODUCTION
    : process.env.WOMPI_PRIVATE_KEY_SANDBOX,
    
  PUBLIC_KEY: process.env.WOMPI_ENVIRONMENT === 'production'
    ? process.env.WOMPI_PUBLIC_KEY_PRODUCTION
    : process.env.WOMPI_PUBLIC_KEY_SANDBOX,

  
  INTEGRITY_KEY: process.env.WOMPI_ENVIRONMENT === 'production'
    ? process.env.WOMPI_INTEGRITY_KEY_PRODUCTION
    : process.env.WOMPI_INTEGRITY_KEY_SANDBOX,

  EVENT_KEY: process.env.WOMPI_ENVIRONMENT === 'production'
  ? process.env.WOMPI_EVENT_KEY_PRODUCTION
  : process.env.WOMPI_EVENT_KEY_SANDBOX,
  
  // Endpoints
  ENDPOINTS: {
    MERCHANT: '/merchants',
    TOKENS: {
      CARDS: '/tokens/cards',
      NEQUI: '/tokens/nequi',
      DAVIPLATA: '/tokens/daviplata',
      BANCOLOMBIA_TRANSFER: '/tokens/bancolombia_transfer',
    },
    PAYMENT_SOURCES: '/payment_sources',
    TRANSACTIONS: '/transactions',
  },
  
  // Payment Methods
  PAYMENT_METHODS: {
    CARD: 'CARD',
    NEQUI: 'NEQUI',
    DAVIPLATA: 'DAVIPLATA',
    BANCOLOMBIA_TRANSFER: 'BANCOLOMBIA_TRANSFER',
    PSE: 'PSE',
  },
  
  // Transaction Statuses
  STATUSES: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DECLINED: 'DECLINED',
    ERROR: 'ERROR',
  },
  
  // Token Statuses
  TOKEN_STATUSES: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    DECLINED: 'DECLINED',
  },
  
  // Timeouts and intervals
  TIMEOUTS: {
    TOKEN_POLL_INTERVAL: 2000, // 2 seconds
    TOKEN_MAX_WAIT: 300000,    // 5 minutes
    TRANSACTION_POLL_INTERVAL: 3000, // 3 seconds
    TRANSACTION_MAX_WAIT: 600000,    // 10 minutes
  },
} as const;

// Helper functions
export const isProduction = (): boolean => WOMPI_CONFIG.ENVIRONMENT === 'production';
export const isSandbox = (): boolean => WOMPI_CONFIG.ENVIRONMENT === 'sandbox';

export const getWompiUrl = (endpoint: string): string => {
  return `${WOMPI_CONFIG.BASE_URL}${endpoint}`;
};

export const getPrivateKey = (): string => {
  if (!WOMPI_CONFIG.PRIVATE_KEY) {
    throw new Error('Wompi private key not configured');
  }
  return WOMPI_CONFIG.PRIVATE_KEY;
};

export const getPublicKey = (): string => {
  if (!WOMPI_CONFIG.PUBLIC_KEY) {
    throw new Error('Wompi public key not configured');
  }
  return WOMPI_CONFIG.PUBLIC_KEY;
}; 

export const getIntegrityKey = (): string => {
  if (!WOMPI_CONFIG.INTEGRITY_KEY) {
    throw new Error('Wompi integrity key not configured');
  }
  return WOMPI_CONFIG.INTEGRITY_KEY;
};

export const getEventKey = (): string => {
  if (!WOMPI_CONFIG.EVENT_KEY) {
    throw new Error('Wompi event key not configured');
  }
  return WOMPI_CONFIG.EVENT_KEY;
};
