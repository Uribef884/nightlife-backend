import { DataSource } from "typeorm";
import { Club } from "../entities/Club";
import { Ticket } from "../entities/Ticket";
import { TicketPurchase } from "../entities/TicketPurchase";
import { User } from "../entities/User";
import { CartItem } from "../entities/CartItem";
import { PurchaseTransaction } from "../entities/PurchaseTransaction"; 
import { Event } from "../entities/Event";
import dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: true,  //cambiar esta linea false
  logging: false,
  entities: [Club, Ticket, TicketPurchase, User, CartItem, PurchaseTransaction, Event ],
});
