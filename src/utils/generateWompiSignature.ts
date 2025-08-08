import crypto from 'crypto';
import { getIntegrityKey, getPublicKey } from '../config/wompi';

/**
 * Generate Wompi integrity signature for tokenization requests
 * 
 * This function creates an HMAC SHA256 signature for card tokenization
 * to ensure data integrity and prevent tampering.
 * 
 * @param requestBody - The request body object (card data, etc.)
 * @returns The hex-encoded HMAC signature
 */
export function generateWompiSignature(requestBody: Record<string, any>): string {
  // Get the public key
  const integrityKey = getIntegrityKey();
  const publicKey = getPublicKey();

  // Sort the keys alphabetically and create key=value pairs
  const sortedEntries = Object.entries(requestBody)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // Append the public key to the string
  const dataToSign = `${sortedEntries}&public_key=${publicKey}`;
  
  // Generate HMAC SHA256 using the public key as the secret
  const hmac = crypto.createHmac('sha256', integrityKey);
  hmac.update(dataToSign);
  
  // Return the hex-encoded signature
  return hmac.digest('hex');
}

/**
 * Generate signature for card tokenization specifically
 * 
 * @param cardData - Card tokenization data
 * @returns The hex-encoded HMAC signature
 */
export function generateCardTokenizationSignature(cardData: {
  number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
  card_holder: string;
}): string {
  return generateWompiSignature(cardData);
}

/**
 * Generate signature for Nequi tokenization
 * 
 * @param nequiData - Nequi tokenization data
 * @returns The hex-encoded HMAC signature
 */
export function generateNequiTokenizationSignature(nequiData: {
  phone_number: string;
}): string {
  return generateWompiSignature(nequiData);
}

/**
 * Generate signature for Daviplata tokenization
 * 
 * @param daviplataData - Daviplata tokenization data
 * @returns The hex-encoded HMAC signature
 */
export function generateDaviplataTokenizationSignature(daviplataData: {
  phone_number: string;
}): string {
  return generateWompiSignature(daviplataData);
}

interface TransactionSignatureInput {
  amount_in_cents: number;
  currency: string;
  reference: string;
}

export function generateTransactionSignature(input: TransactionSignatureInput): string {
  const integrityKey = getIntegrityKey();

  const rawString = `${input.reference}${input.amount_in_cents}${input.currency}${integrityKey}`;

  console.log("🔐 Final integrity string:", rawString);

  return crypto.createHash("sha256").update(rawString).digest("hex");
}

