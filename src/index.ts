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
import cartRoutes from "./routes/ticketCart.routes";
import { attachSessionId } from "./middlewares/sessionMiddleware";
import checkoutRoutes from "./routes/ticketCheckout.routes";
import purchaseRoutes from "./routes/ticketPurchases.routes";
import eventRoutes from "./routes/event.routes";
import menuCategoryRoutes from "./routes/menuCategory.routes";
import menuItemRoutes from "./routes/menuItem.routes";
import menuVariantRoutes from "./routes/menuVariant.routes";
import menuCartRoutes from "./routes/menuCart.routes";
import menuCheckoutRoutes from "./routes/menuCheckout.routes";
import menuPurchaseRoutes from "./routes/menuPurchases.routes";

import session from "express-session";

dotenv.config();

const app = express();
app.set("trust proxy", true); // ✅ REQUIRED for ngrok and proper secure cookie handling
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(cookieParser()); // ✅ make sure this comes before authMiddleware
 // ✅ global middleware

app.use(session({
  secret: process.env.SESSION_SECRET || "nightlife-secret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === "production", // ✅ secure only in production
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // ✅ cross-origin over HTTPS
    maxAge: 1000 * 60 * 30 // 30 minutes
  }
}));

// ✅ Ensure session gets initialized on first request
app.use((req, res, next) => {
  console.log("🔍 SessionID cookie:", req.cookies.sessionId);
  console.log("🔒 Secure req?", req.secure, "Protocol:", req.headers["x-forwarded-proto"]);
  if (!req.session.visited) {
    req.session.visited = true;
  }
  next();
});


app.use(attachSessionId); // Must come before routes that need session
app.use(cors());
app.use(helmet());


//Test cart front end
app.use(express.static("public")); // serve static HTML like test-cart.html


// Routes
app.use("/auth", authRoutes);
app.use("/clubs", clubRoutes);
app.use("/tickets", ticketRoutes); // leave public access to GET endpoints
app.use("/bouncers", bouncerRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/purchases", purchaseRoutes);
app.use("/events", eventRoutes);

// 🔥 Menu System
app.use("/menu/categories", menuCategoryRoutes);
app.use("/menu/items", menuItemRoutes);
app.use("/menu/variants", menuVariantRoutes);
app.use("/menu/cart", menuCartRoutes);
app.use("/menu/checkout", menuCheckoutRoutes);
app.use("/menu/purchases", menuPurchaseRoutes);



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
