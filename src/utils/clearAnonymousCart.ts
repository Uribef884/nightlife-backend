import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";

export async function clearAnonymousCart(sessionId?: string): Promise<void> {
  if (!sessionId) return;

  const cartRepo = AppDataSource.getRepository(CartItem);
  await cartRepo.delete({ sessionId });
}
