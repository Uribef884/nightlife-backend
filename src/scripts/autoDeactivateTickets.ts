import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";

async function run() {
  console.log("🔁 Starting auto-deactivation script...");

  try {
    await AppDataSource.initialize();
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

    const activeTickets = await ticketRepo.find({
      where: {
        isActive: true,
        isRecurrentEvent: false,
      },
    });

    let deactivatedCount = 0;

    for (const ticket of activeTickets) {
      if (ticket.availableDate) {
        const ticketDateStr = new Date(ticket.availableDate).toISOString().split("T")[0];

        if (ticketDateStr < todayStr) {
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

// npm run auto-deactivate