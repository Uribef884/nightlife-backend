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

  @Column()
  qrCodeEncrypted!: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ type: "timestamp", nullable: true })
  usedAt?: Date;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  userPaid!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  clubReceives!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  platformReceives!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  gatewayFee!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) } })
  gatewayIVA!: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) }, nullable: true })
  retentionICA?: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) }, nullable: true })
  retentionIVA?: number;

  @Column("numeric", { transformer: { to: v => v, from: v => parseFloat(v) }, nullable: true })
  retentionFuente?: number;

  @Column("numeric")
  platformFeeApplied!: number;

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
