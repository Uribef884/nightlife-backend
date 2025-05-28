import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";

async function run() {
  console.log("🔁 Starting auto-deactivation script...");

  try {
    await AppDataSource.initialize();
    const ticketRepo = AppDataSource.getRepository(Ticket);

    // Normalize today's date to 00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeTickets = await ticketRepo.find({
      where: {
        isActive: true,
        isRecurrentEvent: false,
      },
    });

    let deactivatedCount = 0;

    for (const ticket of activeTickets) {
      if (ticket.availableDate) {
        const ticketDate = new Date(ticket.availableDate);
        ticketDate.setHours(0, 0, 0, 0); // normalize for comparison

        if (ticketDate < today) {
          ticket.isActive = false;
          await ticketRepo.save(ticket);
          deactivatedCount++;
          console.log(`⛔ Deactivated: ${ticket.name} (ID: ${ticket.id})`);
        }
      }
    }

    console.log(`✅ Finished. Deactivated ${deactivatedCount} non-recurrent ticket(s).`);
  } catch (error) {
    console.error("❌ Error during auto-deactivation:", error);
  } finally {
    await AppDataSource.destroy();
    process.exit(0);
  }
}

run();
