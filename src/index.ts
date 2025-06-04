import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { AppDataSource } from "./config/data-source";
import clubRoutes from "./routes/club.routes";
import ticketRoutes from "./routes/ticket.routes";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import bouncerRoutes from "./routes/bouncer.routes";
import cartRoutes from "./routes/cart.routes";
import { attachSessionId } from "./middlewares/sessionMiddleware";
import checkoutRoutes from "./routes/checkout.routes";
import purchaseRoutes from "./routes/purchases.routes";
import eventRoutes from "./routes/event.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;


// Middleware
app.use(express.json());
app.use(cookieParser()); // ✅ make sure this comes before authMiddleware
 // ✅ global middleware
app.use(attachSessionId); // Must come before routes that need session
app.use(cors());
app.use(helmet());

// Routes
app.use("/auth", authRoutes);
app.use("/clubs", clubRoutes);
app.use("/tickets", ticketRoutes); // leave public access to GET endpoints
app.use("/bouncers", bouncerRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/purchases", purchaseRoutes);
app.use("/events", eventRoutes);

// DB Connection + Server Start
AppDataSource.initialize()
  .then(() => {
    console.log("✅ Connected to DB");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error: any) => {
    console.error("❌ DB connection failed:", error);
  });
