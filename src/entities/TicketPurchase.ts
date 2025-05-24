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

@Entity()
export class TicketPurchase {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Ticket, { eager: true })
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

  @Column()
  ticketId!: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => Club, { eager: false })
  @JoinColumn({ name: "clubId" })
  club!: Club;

  @Column()
  clubId!: string;

  @Column()
  date!: string;

  @Column({ nullable: true })
  buyerName?: string;

  @Column({ nullable: true })
  buyerIdNumber?: string;

  @Column()
  qrCodeEncrypted!: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ type: "timestamp", nullable: true })
  usedAt?: Date;

  @Column()
  email!: string;

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

  @Column("numeric")
  platformFeeApplied!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
