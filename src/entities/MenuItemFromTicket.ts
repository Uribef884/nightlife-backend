import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import { TicketPurchase } from "./TicketPurchase";
import { MenuItem } from "./MenuItem";
import { MenuItemVariant } from "./MenuItemVariant";

@Entity()
export class MenuItemFromTicket {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  ticketPurchaseId!: string;

  @ManyToOne(() => TicketPurchase, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticketPurchaseId" })
  ticketPurchase!: TicketPurchase;

  @Column()
  menuItemId!: string;

  @ManyToOne(() => MenuItem, { onDelete: "CASCADE" })
  @JoinColumn({ name: "menuItemId" })
  menuItem!: MenuItem;

  @Column({ nullable: true })
  variantId?: string;

  @ManyToOne(() => MenuItemVariant, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "variantId" })
  variant?: MenuItemVariant;

  @Column("int")
  quantity!: number;

  @CreateDateColumn()
  createdAt!: Date;
} 