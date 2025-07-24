import { createCipheriv, randomBytes } from "crypto";
import QRCode from "qrcode";

const algorithm = "aes-256-cbc";
const rawKey = process.env.QR_ENCRYPTION_KEY;

if (!rawKey || rawKey.length !== 32) {
  throw new Error("❌ QR_ENCRYPTION_KEY must be exactly 32 characters");
}

const key = Buffer.from(rawKey, "utf-8"); // ✅ Use utf-8, not hex

type QRPayload = {
  type: "ticket" | "menu" | "menu_from_ticket";
  [key: string]: any; // ✅ allow additional fields like transactionId, email, etc.
};

export async function generateEncryptedQR(data: QRPayload): Promise<string> {
  const iv = randomBytes(16);
  const json = JSON.stringify(data);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

