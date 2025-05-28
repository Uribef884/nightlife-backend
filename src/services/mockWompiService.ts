import crypto from "crypto";

// 🧠 In-memory store that resets on every server restart
const mockTransactionStore = new Map<string, { used: boolean }>();

// 🪵 Helper logger
function log(message: string, extra?: any) {
  const timestamp = new Date().toISOString();
  if (extra) {
    console.log(`[${timestamp}] [MOCK-WOMPI] ${message}`, extra);
  } else {
    console.log(`[${timestamp}] [MOCK-WOMPI] ${message}`);
  }
}

// 🎟 Issue new mock transaction ID
export function issueMockTransaction(): string {
  const id = `mock_txn_${crypto.randomUUID()}`;
  mockTransactionStore.set(id, { used: false });
  log(`Issued new transaction ID: ${id}`);
  return id;
}

// ✅ Validate and consume transaction ID
export async function mockValidateWompiTransaction(transactionId: string): Promise<{ approved: boolean }> {
  const entry = mockTransactionStore.get(transactionId);

  if (!entry) {
    log(`❌ Transaction ID not found: ${transactionId}`);
    return { approved: false };
  }

  if (entry.used) {
    log(`❌ Transaction ID already used: ${transactionId}`);
    return { approved: false };
  }

  entry.used = true;
  log(`✅ Transaction approved: ${transactionId}`);
  return { approved: true };
}
