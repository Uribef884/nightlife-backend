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
    today.setHours(0, 0, 0, 0); // Normalize to midnight

    for (const ticket of tickets) {
      if (!ticket.availableDate) continue;

      const currentDate = new Date(ticket.availableDate);
      currentDate.setHours(0, 0, 0, 0);

      if (ticket.isRecurrentEvent) {
        // ✅ Refresh logic for recurring ticket
        const nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 8);

        ticket.availableDate = nextDate;
        ticket.quantity = ticket.originalQuantity ?? ticket.quantity;
        ticket.isActive = true;

        console.log(`🔁 Refreshed: ${ticket.name} → ${nextDate.toDateString()}`);
      } else {
        // ✅ Deactivate if past date and not recurrent
        if (currentDate < today && ticket.isActive) {
          ticket.isActive = false;
          console.log(`⛔ Deactivated: ${ticket.name} (expired on ${currentDate.toDateString()})`);
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
