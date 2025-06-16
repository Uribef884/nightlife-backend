import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Club } from "./Club";
import { CartItem } from "./TicketCartItem";
import { Event } from "./Event";

export enum TicketCategory {
  GENERAL = "general",
  EVENT = "event",
  FREE = "free",
}

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column("decimal")
  price!: number;

  @Column({ default: false })
  dynamicPricingEnabled!: boolean;

  @Column("int")
  maxPerPerson!: number;

  @Column("int")
  priority!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: "date", nullable: true })
  availableDate?: Date;

  @Column("int", { nullable: true })
  quantity?: number;

  @Column("int", { nullable: true })
  originalQuantity?: number;

  @Column({
    type: "enum",
    enum: TicketCategory,
    default: TicketCategory.GENERAL,
  })
  category!: TicketCategory;

  @Column()
  clubId!: string;

  @ManyToOne(() => Club, (club) => club.tickets, { onDelete: "CASCADE" })
  club!: Club;

  @Column({ nullable: true })
  eventId?: string;

  @ManyToOne(() => Event, (event) => event.tickets, { onDelete: "CASCADE", nullable: true })
  event?: Event;

  @OneToMany(() => CartItem, (cartItem: CartItem) => cartItem.ticket)
  cartItems!: CartItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
