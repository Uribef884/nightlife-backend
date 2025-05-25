import { createCipheriv, randomBytes } from "crypto";
import QRCode from "qrcode";

const algorithm = "aes-256-cbc";
const key = Buffer.from(process.env.QR_ENCRYPTION_KEY!, "hex"); // 32 bytes
const iv = randomBytes(16);

export async function generateEncryptedQR(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]).toString("base64");
  return await QRCode.toDataURL(payload);
}
