import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Event } from "../entities/Event";

async function run() {
  console.log("🔁 Starting expired ticket & event deactivation...");

  try {
    await AppDataSource.initialize();
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const eventRepo = AppDataSource.getRepository(Event);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

    // --- TICKETS ---
    const expiredTickets = await ticketRepo
      .createQueryBuilder()
      .update(Ticket)
      .set({ isActive: false })
      .where('"isActive" = true')
      .andWhere('"availableDate" IS NOT NULL')
      .andWhere(`"availableDate"::date < :today`, { today: todayStr })
      .returning(["id", "name", "availableDate"])
      .execute();

    if (expiredTickets.affected && expiredTickets.affected > 0) {
      console.log(`⛔ Deactivated ${expiredTickets.affected} ticket(s):`);
      expiredTickets.raw.forEach((t: any) => {
        console.log(`- ${t.name} (ID: ${t.id}) | Date: ${t.availableDate}`);
      });
    } else {
      console.log("✅ No expired tickets found.");
    }

    // --- EVENTS ---
    const expiredEvents = await eventRepo
      .createQueryBuilder()
      .update(Event)
      .set({ isActive: false })
      .where('"isActive" = true')
      .andWhere('"availableDate" IS NOT NULL')
      .andWhere(`"availableDate"::date < :today`, { today: todayStr })
      .returning(["id", "name", "availableDate"])
      .execute();

    if (expiredEvents.affected && expiredEvents.affected > 0) {
      console.log(`⛔ Deactivated ${expiredEvents.affected} event(s):`);
      expiredEvents.raw.forEach((e: any) => {
        console.log(`- ${e.name} (ID: ${e.id}) | Date: ${e.availableDate}`);
      });
    } else {
      console.log("✅ No expired events found.");
    }
  } catch (error) {
    console.error("❌ Error during deactivation:", error);
  } finally {
    await AppDataSource.destroy();
    process.exit(0);
  }
}

run();

// npm run auto-deactivate