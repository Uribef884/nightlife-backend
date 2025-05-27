const mockTransactionStore = new Map<string, { used: boolean }>();

export function issueMockTransaction(): string {
  const id = `mock_txn_${crypto.randomUUID()}`;
  mockTransactionStore.set(id, { used: false });
  return id;
}

export async function mockValidateWompiTransaction(transactionId: string): Promise<{ approved: boolean }> {
  const entry = mockTransactionStore.get(transactionId);
  if (!entry || entry.used) return { approved: false };
  entry.used = true; // mark as consumed
  return { approved: true };
}
