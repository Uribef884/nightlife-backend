import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { MenuCartItem } from "../entities/MenuCartItem"; // ✅ import menu cart


export async function clearAnonymousCart(sessionId?: string): Promise<void> {
  if (!sessionId) return;

  const ticketRepo = AppDataSource.getRepository(CartItem);
  const menuRepo = AppDataSource.getRepository(MenuCartItem);

  await ticketRepo.delete({ sessionId });  // ✅ Clears ticket cart
  await menuRepo.delete({ sessionId });    // ✅ Clears menu cart
}