import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Ticket } from "./Ticket";
import { MenuItem } from "./MenuItem";
import { MenuItemVariant } from "./MenuItemVariant";

@Entity()
export class TicketIncludedMenuItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  ticketId!: string;

  @ManyToOne(() => Ticket, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

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
} 