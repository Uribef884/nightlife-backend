import { createDecipheriv } from "crypto";

const algorithm = "aes-256-cbc";
const rawKey = process.env.QR_ENCRYPTION_KEY;

if (!rawKey || rawKey.length !== 32) {
  throw new Error("❌ QR_ENCRYPTION_KEY must be exactly 32 characters");
}

const key = Buffer.from(rawKey, "utf-8");

export type QRPayload = {
  type: "ticket" | "menu" | "menu_from_ticket";
  id?: string;
  clubId: string;
  ticketPurchaseId?: string;
  [key: string]: any;
};

export function decryptQR(encryptedQR: string): QRPayload {
  try {
    const buffer = Buffer.from(encryptedQR, "base64");
    const iv = buffer.subarray(0, 16);
    const encrypted = buffer.subarray(16);
    const decipher = createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const json = decrypted.toString("utf-8");
    const payload = JSON.parse(json) as QRPayload;
    return payload;
  } catch (error) {
    throw new Error("Invalid QR code");
  }
} 