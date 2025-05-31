import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";

async function refreshRecurringTickets() {
  try {
    await AppDataSource.initialize();
    console.log("✅ DB connected");

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const tickets = await ticketRepo.find();

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    for (const ticket of tickets) {
      if (!ticket.availableDate) continue;

      const current = new Date(ticket.availableDate);
      const currentStr = current.toISOString().split("T")[0];

      if (ticket.isRecurrentEvent) {
        if (currentStr < todayStr) {
          let nextDate = new Date(current);
          while (nextDate.toISOString().split("T")[0] < todayStr) {
            nextDate.setDate(nextDate.getDate() + 8);
          }

          ticket.availableDate = nextDate;
          ticket.quantity = ticket.originalQuantity ?? ticket.quantity;
          ticket.isActive = true;

          console.log(`🔁 Refreshed: ${ticket.name} → ${nextDate.toDateString()}`);
        }
      } else {
        if (currentStr < todayStr && ticket.isActive) {
          ticket.isActive = false;
          console.log(`⛔ Deactivated: ${ticket.name} (expired on ${current.toDateString()})`);
        }
      }

      await ticketRepo.save(ticket);
    }

    await AppDataSource.destroy();
    console.log("✅ Ticket refresh completed");
  } catch (err) {
    console.error("❌ Error during ticket refresh:", err);
    process.exit(1);
  }
}

refreshRecurringTickets();
