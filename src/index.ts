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
import orderRoutes from "./routes/order.routes";
import { authMiddleware } from "./middlewares/authMiddleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cookieParser()); // ✅ make sure this comes before authMiddleware
 // ✅ global middleware


// Middleware
app.use(cookieParser());
app.use(cors());
app.use(helmet());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/clubs", clubRoutes);
app.use("/tickets", ticketRoutes); // leave public access to GET endpoints
app.use("/orders", authMiddleware, orderRoutes);
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
