import { createDecipheriv } from "crypto";

const algorithm = "aes-256-cbc";
const rawKey = process.env.QR_ENCRYPTION_KEY;

if (!rawKey || rawKey.length !== 32) {
  throw new Error("❌ QR_ENCRYPTION_KEY must be exactly 32 characters");
}

const key = Buffer.from(rawKey, "utf-8");

export type QRPayload = {
  type: "ticket" | "menu";
  purchaseId: string;
  [key: string]: any;
};

export function decryptQR(encryptedQR: string): QRPayload {
  try {
    console.log("🔓 Attempting to decrypt QR code...");
    console.log("🔑 Using encryption key length:", rawKey?.length);
    const buffer = Buffer.from(encryptedQR, "base64");
    console.log("📦 Buffer length:", buffer.length);
    const iv = buffer.subarray(0, 16);
    const encrypted = buffer.subarray(16);
    console.log("🔐 IV length:", iv.length, "Encrypted length:", encrypted.length);
    const decipher = createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const json = decrypted.toString("utf-8");
    console.log("🔓 Decrypted JSON:", json);
    const payload = JSON.parse(json) as QRPayload;
    console.log("✅ QR payload parsed:", { type: payload.type, purchaseId: payload.purchaseId });
    return payload;
  } catch (error) {
    console.error("❌ QR decryption failed:", error);
    throw new Error("Invalid QR code");
  }
} 