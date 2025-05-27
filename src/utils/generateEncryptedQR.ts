import { createCipheriv, randomBytes } from "crypto";
import QRCode from "qrcode";

const algorithm = "aes-256-cbc";
const rawKey = process.env.QR_ENCRYPTION_KEY;

if (!rawKey || rawKey.length !== 32) {
  throw new Error("❌ QR_ENCRYPTION_KEY must be exactly 32 characters");
}

const key = Buffer.from(rawKey, "utf-8"); // ✅ Use utf-8, not hex

export async function generateEncryptedQR(data: object): Promise<string> {
  const iv = randomBytes(16); // new IV per QR
  const json = JSON.stringify(data);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]).toString("base64");
  return await QRCode.toDataURL(payload); // returns base64 QR image
}
