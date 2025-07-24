import { DataSource } from "typeorm";
import { Club } from "../entities/Club";
import { Ticket } from "../entities/Ticket";
import { TicketPurchase } from "../entities/TicketPurchase";
import { User } from "../entities/User";
import { CartItem } from "../entities/TicketCartItem";
import { PurchaseTransaction } from "../entities/TicketPurchaseTransaction"; 
import { Event } from "../entities/Event";
import dotenv from "dotenv";
import { MenuCategory } from "../entities/MenuCategory";
import { MenuItem } from "../entities/MenuItem";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { MenuCartItem } from "../entities/MenuCartItem";
import { MenuPurchase } from "../entities/MenuPurchase";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { MenuItemFromTicket } from "../entities/MenuItemFromTicket";
import { Ad } from "../entities/Ad";

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
  entities: [
    Club, 
    Ticket, 
    TicketPurchase, 
    User, 
    CartItem, 
    PurchaseTransaction, 
    Event,
    Ad,
    MenuCategory, 
    MenuItem, 
    MenuItemVariant, 
    MenuCartItem, 
    MenuPurchase, 
    MenuPurchaseTransaction,
    TicketIncludedMenuItem,
    MenuItemFromTicket,
  ],
});
