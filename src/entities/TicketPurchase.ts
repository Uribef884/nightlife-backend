import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Ticket } from "./Ticket";
import { User } from "./User";
import { Club } from "./Club";
import { PurchaseTransaction } from "./TicketPurchaseTransaction";

@Entity()
export class TicketPurchase {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Ticket, { eager: true })
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

  @Column()
  ticketId!: string;

  @Column({ type: "varchar", nullable: true, default: null })
  userId!: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  sessionId!: string | null;

  @ManyToOne(() => Club)
  @JoinColumn({ name: "clubId" })
  club!: Club;

  @Column()
  clubId!: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ nullable: true })
  buyerName?: string;

  @Column({ nullable: true })
  buyerIdNumber?: string;

  @Column()
  email!: string;

  @Column({ nullable: true })
  qrCodeEncrypted?: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ type: "timestamp", nullable: true })
  usedAt?: Date;

  @Column({ default: false })
  isUsedMenu!: boolean;

  @Column({ type: "timestamp", nullable: true })
  menuQRUsedAt?: Date;

  // 🎯 Individual ticket pricing information
  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  originalBasePrice!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  priceAtCheckout!: number;

  @Column({ default: false })
  dynamicPricingWasApplied!: boolean;

  @Column({ type: "varchar", nullable: true })
  dynamicPricingReason?: string; // e.g., "early_bird", "closed_day", "event_advance"

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  clubReceives!: number; // What the club gets for this specific ticket

  // 🎯 Individual ticket fees (proportional to this ticket's price)
  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  platformFee!: number; // Platform fee for this specific ticket

  @Column("numeric")
  platformFeeApplied!: number; // Platform fee percentage applied

  @ManyToOne(() => PurchaseTransaction, (t) => t.purchases)
  @JoinColumn({ name: "purchaseTransactionId" })
  transaction!: PurchaseTransaction;

  @Column()
  purchaseTransactionId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
